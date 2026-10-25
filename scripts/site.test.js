// Tests for the generated website: locale completeness, build freshness, links, hreflang, the
// extension's own slogan, and the promises the site makes about privacy.
// Runs under `npm test` (node:test). Builds into a temp directory, never touches site/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTENT_PAGES, LANGUAGES, PAGES, ROOT, SITE_URL, buildSite, pagePath, readExtensionStrings, readLocale,
} from './build-site.js';

const SITE = path.join(ROOT, 'site');
const SRC = path.join(ROOT, 'site-src');
const LOCALES = LANGUAGES.map(l => l.locale);

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const rel = (base, file) => path.relative(base, file).split(path.sep).join('/');
const flat = (value, prefix = '') => {
  if (Array.isArray(value)) return value.flatMap((v, i) => flat(v, `${prefix}.${i}`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
};
const at = (obj, key) => key.split('.').reduce((cur, part) => (cur == null ? cur : cur[part]), obj);
const tags = s => (s.match(/<\/?[a-z]+[^>]*>/g) || []).join('');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const placeholders = s => (s.match(/\{\{[^}]+\}\}|\{\w+\}/g) || []).sort().join(',');

const en = readLocale('en');

/* ---------------------------------------------------------------- locales */

test('every language has its own locale file', () => {
  for (const locale of LOCALES) {
    assert.ok(fs.existsSync(path.join(SRC, 'locales', `${locale}.json`)), `${locale}.json is missing`);
  }
});

for (const locale of LOCALES.filter(l => l !== 'en')) {
  const loc = readLocale(locale);

  test(`${locale}: same keys as en.json, no extras`, () => {
    const missing = flat(en).filter(k => !flat(loc).includes(k));
    const extra = flat(loc).filter(k => !flat(en).includes(k));
    assert.deepEqual({ missing, extra }, { missing: [], extra: [] });
  });

  test(`${locale}: no empty strings, same HTML and placeholders as en.json`, () => {
    const bad = [];
    for (const key of flat(en)) {
      const source = at(en, key);
      const value = at(loc, key);
      if (typeof value !== 'string' || !value.trim()) { bad.push(`${key}: empty`); continue; }
      if (tags(source) !== tags(value)) bad.push(`${key}: HTML tags differ`);
      if (placeholders(source) !== placeholders(value)) bad.push(`${key}: placeholders differ`);
    }
    assert.deepEqual(bad, []);
  });

  test(`${locale}: the privacy page says the English version prevails`, () => {
    assert.ok(at(loc, 'privacy.prevails').length > 10, `${locale} has no "prevails" sentence`);
  });
}

/* ---------------------------------------------------------------- build output */

test('site/ is up to date with site-src/', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'senderfinder-site-'));
  try {
    buildSite(tmp);
    const built = walk(tmp).map(f => rel(tmp, f)).sort();
    const shipped = walk(SITE).map(f => rel(SITE, f)).sort();
    assert.deepEqual(shipped, built, 'file list differs: run `npm run site`');
    const changed = built.filter(f => !fs.readFileSync(path.join(tmp, f)).equals(fs.readFileSync(path.join(SITE, f))));
    assert.deepEqual(changed, [], 'file contents differ: run `npm run site`');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

/* ---------------------------------------------------------------- pages */

const pageFile = (lang, page) => (lang.dir ? `${lang.dir}/${page.out}` : page.out);
const pageOf = (lang, page) => fs.readFileSync(path.join(SITE, pageFile(lang, page)), 'utf8');

test('every page exists in every language', () => {
  for (const lang of LANGUAGES) {
    for (const page of PAGES) {
      if (page.noindex && lang.locale !== 'en') continue;
      const file = path.join(SITE, pageFile(lang, page));
      assert.ok(fs.existsSync(file), `${rel(SITE, file)} is missing`);
    }
  }
});

test('the home page is titled after the extension slogan and says nothing else', () => {
  for (const lang of LANGUAGES) {
    const html = pageOf(lang, PAGES[0]);
    const { slogan, tagline } = readExtensionStrings(lang.locale);
    assert.ok(html.includes(`<title>SenderFinder — ${esc(slogan)}</title>`), `${lang.locale}: title is not "SenderFinder — panel_slogan"`);
    // the headline may highlight one word with markup, so compare its text content
    const h1 = html.match(/<h1 id="hero-title"[^>]*>([\s\S]*?)<\/h1>/);
    assert.ok(h1, `${lang.locale}: no hero headline`);
    const h1Text = h1[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    assert.equal(h1Text, slogan.replace(/\s+/g, ' ').trim(), `${lang.locale}: hero headline is not panel_slogan`);
    const taglineHtml = html.match(/<p class="(?:lead|v2-hero-lead)">([\s\S]*?)<\/p>/);
    assert.ok(taglineHtml, `${lang.locale}: no hero tagline`);
    assert.equal(taglineHtml[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), tagline.replace(/\s+/g, ' ').trim(),
      `${lang.locale}: hero sub-line is not tagline`);
  }
});

test('the old headline "See who\'s emailing you" is gone everywhere', () => {
  const banned = [/see who'?s emailing you/i, /who is emailing you\?/i];
  for (const file of walk(SITE).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    for (const re of banned) assert.doesNotMatch(html, re, `${rel(SITE, file)} still carries the old headline`);
  }
  for (const locale of LOCALES) {
    const loc = readLocale(locale);
    for (const key of flat(loc)) {
      const value = at(loc, key);
      if (typeof value !== 'string') continue;
      for (const re of banned) assert.doesNotMatch(value, re, `${locale}:${key} still carries the old headline`);
    }
  }
});

test('usage statistics are never described as off by default or opt-in', () => {
  // The extension is opt-out: core/telemetry.js and lib/settings.js say the counts are on until they are
  // switched off. The site must say so too, in every language.
  const banned = [
    /off by default/i, /opt[- ]?in\b/i, /unless you opt/i, /only after you (opt|enable|turn)/i,
    /默认关闭|默认不开启|需同意|主动开启/, /預設關閉|預設不開啟|需同意|主動開啟/,
    /既定でオフ|既定ではオフ|オプトイン|同意が必要/,
    /기본적으로 꺼져|기본적으로 비활성|옵트인|동의가 필요/,
    /standardmäßig (aus|deaktiviert)|opt[- ]?in\b/i,
    /désactiv[ée]es? par défaut|opt[- ]?in\b|consentement (requis|nécessaire)/i,
    /desactivad[oa]s? por defecto|opt[- ]?in\b|consentimiento (requerido|necesario)/i,
    /disattivat[ae] per impostazione predefinita|opt[- ]?in\b|consenso (richiesto|necessario)/i,
    /desativad[oa]s? por padrão|opt[- ]?in\b|consentimento (necessário|obrigatório)/i,
  ];
  for (const locale of LOCALES) {
    const loc = readLocale(locale);
    for (const key of flat(loc)) {
      const value = at(loc, key);
      if (typeof value !== 'string') continue;
      for (const re of banned) assert.doesNotMatch(value, re, `${locale}:${key} says usage counts are off by default / opt-in`);
    }
  }
  for (const file of walk(SITE).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    for (const re of banned) assert.doesNotMatch(html, re, `${rel(SITE, file)} says usage counts are off by default / opt-in`);
  }
});

test('the site follows the extension: usage statistics are on by default there and here', () => {
  const settings = fs.readFileSync(path.join(ROOT, 'extension', 'lib', 'settings.js'), 'utf8');
  assert.match(settings, /telemetry:\s*true/, 'extension/lib/settings.js no longer turns telemetry on by default');
  const enText = flat(en).map(k => at(en, k)).filter(v => typeof v === 'string').join('\n');
  assert.match(enText, /on by default/i, 'the English copy never says the usage counts are on by default');
  assert.match(enText, /no SenderFinder server in the lookup path/i, 'the "no server" claim is not qualified with "in the lookup path"');
});

test('non-English pages carry no untranslated English sentences', () => {
  // Long English strings from en.json must not survive verbatim in another language. Strings that are only
  // product names, code, prices or step chains are allowed through; prose is what this guards.
  const decode = s => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const productish = /^(?:BlitzAPI|Hunter|Monid|treg|Firecrawl|Apollo|ContactOut|QuickEnrich|Village|Data Legion|LinkedIn|Gmail|Outlook|Chrome|GitHub|SenderFinder|AGPL|IndexedDB|JSON|CSV|Cloudflare|Cloudflare Worker|Cloudflare D1)/;
  const english = [...new Set(flat(en).map(k => at(en, k)))]
    .filter(v => typeof v === 'string' && v.length > 45 && !v.includes('<'))
    .filter(v => (v.match(/[A-Za-z]{3,}/g) || []).length >= 6)
    .filter(v => !productish.test(v.trim()));
  const failures = [];
  for (const lang of LANGUAGES.filter(l => l.locale !== 'en')) {
    for (const page of PAGES) {
      if (page.noindex) continue;
      const text = decode(pageOf(lang, page));
      for (const sentence of english) if (text.includes(sentence)) failures.push(`${lang.locale}/${page.id}: "${sentence.slice(0, 60)}…"`);
    }
  }
  assert.deepEqual([...new Set(failures)], []);
});

test('every page has the full hreflang set and a matching canonical', () => {
  for (const lang of LANGUAGES) {
    for (const page of CONTENT_PAGES) {
      const html = pageOf(lang, page);
      for (const other of LANGUAGES) {
        const href = `${SITE_URL}${pagePath(other, page)}`;
        assert.ok(html.includes(`<link rel="alternate" hreflang="${other.hreflang}" href="${href}">`),
          `${rel(SITE, pageFile(lang, page))} is missing hreflang ${other.hreflang}`);
      }
      const enHref = `${SITE_URL}${pagePath(LANGUAGES[0], page)}`;
      assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${enHref}">`));
      assert.ok(html.includes(`<link rel="canonical" href="${SITE_URL}${pagePath(lang, page)}">`));
      assert.ok(html.includes(`<html lang="${lang.htmlLang}">`));
    }
  }
});

test('the language switcher links every language to the same page', () => {
  for (const lang of LANGUAGES) {
    for (const page of PAGES) {
      if (page.noindex && lang.locale !== 'en') continue;
      const html = pageOf(lang, page);
      const links = [...html.matchAll(/<li><a href="([^"]+)" hreflang="[^"]+" lang="[^"]+"( aria-current="page")?>/g)];
      assert.equal(links.length, LANGUAGES.length, `${rel(SITE, pageFile(lang, page))}: ${links.length} language links`);
      const targets = links.map(m => path.posix.normalize(path.posix.join(path.posix.dirname(pageFile(lang, page)), m[1])));
      const expected = page.noindex
        ? LANGUAGES.map(l => pageFile(l, PAGES[0]))
        : LANGUAGES.map(l => pageFile(l, page));
      assert.deepEqual(targets.sort(), expected.sort());
    }
  }
});

test('every page carries the notice, the theme switch and the brand icon', () => {
  for (const lang of LANGUAGES) {
    for (const page of PAGES) {
      if (page.noindex && lang.locale !== 'en') continue;
      const html = pageOf(lang, page);
      assert.ok(html.includes('class="notice" id="notice"'), 'notice markup missing');
      assert.ok(html.includes('data-consent-mode='), 'notice has no consent mode flag');
      assert.ok(html.includes('class="theme-switch"'), 'theme switch missing');
      assert.ok(html.includes(`src="${lang.dir ? '../' : ''}assets/icon-128.png" alt="" width="32" height="32"`),
        'header icon missing or wrong path');
      assert.ok(html.includes(`href="${lang.dir ? '../' : ''}assets/favicon.svg"`), 'favicon missing');
    }
  }
});

test('every local link, script and image resolves to a file in site/', () => {
  const broken = [];
  for (const file of walk(SITE).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, ''); // placeholders live in comments too
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
    for (const ref of refs) {
      if (/^(https?:|mailto:|#|data:)/.test(ref)) continue;
      const [target] = ref.split('#');
      if (!target) continue;                    // "#anchor" on the same page
      const resolved = path.resolve(path.dirname(file), target);
      if (!fs.existsSync(resolved)) broken.push(`${rel(SITE, file)} → ${ref}`);
    }
  }
  assert.deepEqual([...new Set(broken)], []);
});

test('no page loads anything from a third party', () => {
  for (const file of walk(SITE).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    const external = [...html.matchAll(/(?:src|srcset)="(https?:[^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(external, [], `${rel(SITE, file)} loads ${external.join(', ')}`);
  }
});

test('the generated assets include the icon and the provider marks copied from the extension', () => {
  for (const file of ['assets/icon-128.png', 'assets/favicon.svg', 'assets/vendors/treg.svg', 'assets/vendors/monid.svg',
    'assets/vendors/firecrawl.png', 'assets/avatars/jane.svg', 'assets/screenshots/sender-in-gmail.png',
    'assets/screenshots/side-panel.png', 'assets/screenshots/load-unpacked.png', '.assetsignore', '_headers', 'robots.txt', 'sitemap.xml']) {
    assert.ok(fs.existsSync(path.join(SITE, file)), `${file} is missing from site/`);
  }
  assert.match(fs.readFileSync(path.join(SITE, '_headers'), 'utf8'), /Content-Security-Policy: .*script-src 'self'/);
});

test('the sitemap lists every page in every language with alternates', () => {
  const xml = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  for (const lang of LANGUAGES) {
    for (const page of CONTENT_PAGES) {
      assert.ok(xml.includes(`<loc>${SITE_URL}${pagePath(lang, page)}</loc>`), `sitemap is missing ${pagePath(lang, page)}`);
    }
  }
  assert.equal((xml.match(/<url>/g) || []).length, CONTENT_PAGES.length * LANGUAGES.length);
  assert.equal((xml.match(/hreflang="x-default"/g) || []).length, CONTENT_PAGES.length * LANGUAGES.length);
});
