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
  CONTENT_PAGES, LANGUAGES, PAGES, PKG, ROOT, SITE_URL, UPDATED, buildSite, hasPage, pageLocales, pagePath, readExtensionStrings, readLocale,
} from './build-site.js';
import { benchStats } from './bench-stats.js';

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

test('every page exists in every language it declares', () => {
  for (const lang of LANGUAGES) {
    for (const page of PAGES) {
      const file = path.join(SITE, pageFile(lang, page));
      if (hasPage(page, lang.locale)) assert.ok(fs.existsSync(file), `${rel(SITE, file)} is missing`);
      else assert.ok(!fs.existsSync(file), `${rel(SITE, file)} exists but the page declares no ${lang.locale} version`);
    }
  }
});

test('the home page shares the extension slogan and uses localized supporting copy', () => {
  for (const lang of LANGUAGES) {
    const html = pageOf(lang, PAGES[0]);
    const { slogan } = readExtensionStrings(lang.locale);
    const lead = readLocale(lang.locale).index.hero.lead;
    assert.ok(html.includes(`<title>SenderFinder — ${esc(slogan)}</title>`), `${lang.locale}: title is not "SenderFinder — panel_slogan"`);
    // the headline may highlight one word with markup, so compare its text content
    const h1 = html.match(/<h1 id="hero-title"[^>]*>([\s\S]*?)<\/h1>/);
    assert.ok(h1, `${lang.locale}: no hero headline`);
    const h1Text = h1[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    assert.equal(h1Text, slogan.replace(/\s+/g, ' ').trim(), `${lang.locale}: hero headline is not panel_slogan`);
    const taglineHtml = html.match(/<p class="(?:lead|v2-hero-lead)">([\s\S]*?)<\/p>/);
    assert.ok(taglineHtml, `${lang.locale}: no hero tagline`);
    assert.equal(taglineHtml[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), lead.replace(/\s+/g, ' ').trim(),
      `${lang.locale}: hero supporting copy is not index.hero.lead`);
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
      if (!hasPage(page, lang.locale)) continue;
      const text = decode(pageOf(lang, page));
      for (const sentence of english) if (text.includes(sentence)) failures.push(`${lang.locale}/${page.id}: "${sentence.slice(0, 60)}…"`);
    }
  }
  assert.deepEqual([...new Set(failures)], []);
});

test('every page has the hreflang set of the languages it exists in, and a matching canonical', () => {
  for (const lang of LANGUAGES) {
    for (const page of CONTENT_PAGES) {
      if (!hasPage(page, lang.locale)) continue;
      const html = pageOf(lang, page);
      const locales = pageLocales(page);
      for (const code of locales) {
        const other = LANGUAGES.find(l => l.locale === code);
        const href = `${SITE_URL}${pagePath(other, page)}`;
        assert.ok(html.includes(`<link rel="alternate" hreflang="${other.hreflang}" href="${href}">`),
          `${rel(SITE, pageFile(lang, page))} is missing hreflang ${other.hreflang}`);
      }
      for (const other of LANGUAGES.filter(l => !locales.includes(l.locale))) {
        assert.ok(!html.includes(`hreflang="${other.hreflang}" href="${SITE_URL}${pagePath(other, page)}"`),
          `${rel(SITE, pageFile(lang, page))} advertises a ${other.hreflang} version that does not exist`);
      }
      const defaultHref = `${SITE_URL}${pagePath(LANGUAGES.find(l => l.locale === locales[0]), page)}`;
      assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${defaultHref}">`));
      assert.ok(html.includes(`<link rel="canonical" href="${SITE_URL}${pagePath(lang, page)}">`));
      assert.ok(html.includes(`<html lang="${lang.htmlLang}">`));
    }
  }
});

test('the language switcher links each language to the same page, or to its home page', () => {
  for (const lang of LANGUAGES) {
    for (const page of PAGES) {
      if (!hasPage(page, lang.locale)) continue;
      const html = pageOf(lang, page);
      const links = [...html.matchAll(/<li><a href="([^"]+)" hreflang="[^"]+" lang="[^"]+"( aria-current="page")?>/g)];
      assert.equal(links.length, LANGUAGES.length, `${rel(SITE, pageFile(lang, page))}: ${links.length} language links`);
      const targets = links.map(m => path.posix.normalize(m[1]));
      const expected = LANGUAGES.map(l => pagePath(l, hasPage(page, l.locale) ? page : PAGES[0]));
      assert.deepEqual(targets.sort(), expected.sort());
    }
  }
});

test('every page carries the notice, the theme switch and the brand icon', () => {
  for (const lang of LANGUAGES) {
    for (const page of PAGES) {
      if (!hasPage(page, lang.locale)) continue;
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

const urlToFile = new Map();
for (const lang of LANGUAGES) {
  for (const page of PAGES) {
    if (hasPage(page, lang.locale)) urlToFile.set(pagePath(lang, page), pageFile(lang, page));
  }
}

test('every local link, script and image resolves to a file in site/', () => {
  const broken = [];
  for (const file of walk(SITE).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, ''); // placeholders live in comments too
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
    for (const ref of refs) {
      if (/^(?:[a-z]+:|\/\/|#)/i.test(ref)) continue;
      const [target] = ref.split('#');
      if (!target) continue;                    // "#anchor" on the same page
      let resolved;
      if (target.startsWith('/')) {
        const canonical = path.posix.normalize(target);
        resolved = urlToFile.has(canonical)
          ? path.join(SITE, urlToFile.get(canonical))
          : path.join(SITE, canonical.slice(1));
      } else {
        resolved = path.resolve(path.dirname(file), target);
      }
      if (!fs.existsSync(resolved)) broken.push(`${rel(SITE, file)} → ${ref}`);
    }
  }
  assert.deepEqual([...new Set(broken)], []);
});

test('internal links use canonical extensionless URLs, never .html files', () => {
  const failures = [];
  for (const file of walk(SITE).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
      const ref = match[1];
      if (/^(?:[a-z]+:|\/\/|#)/i.test(ref)) continue;
      if (ref.split('#')[0].split('?')[0].endsWith('.html')) failures.push(`${rel(SITE, file)} → ${ref}`);
    }
  }
  assert.deepEqual([...new Set(failures)], []);
});

const jsonLdOf = html => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1, 'expected exactly one JSON-LD block');
  return JSON.parse(blocks[0][1]);
};

const graphOf = html => {
  const ld = jsonLdOf(html);
  assert.equal(ld['@context'], 'https://schema.org');
  assert.ok(Array.isArray(ld['@graph']), 'JSON-LD has no @graph');
  return ld['@graph'];
};
const typeOf = (graph, type) => graph.find(node => node['@type'] === type);

test('every page carries parseable WebSite + Organization JSON-LD', () => {
  for (const lang of LANGUAGES) {
    for (const page of PAGES) {
      if (!hasPage(page, lang.locale)) continue;
      const graph = graphOf(pageOf(lang, page));
      const site = typeOf(graph, 'WebSite');
      const org = typeOf(graph, 'Organization');
      assert.ok(site, `${rel(SITE, pageFile(lang, page))}: no WebSite`);
      assert.equal(site.url, `${SITE_URL}/`);
      assert.equal(site.inLanguage, lang.htmlLang);
      assert.ok(org, `${rel(SITE, pageFile(lang, page))}: no Organization`);
      assert.equal(org.name, 'SenderFinder');
      assert.deepEqual(org.sameAs, ['https://github.com/astonysh/SenderFinder']);
      assert.equal(org.logo.url, `${SITE_URL}/assets/icon-128.png`);
      if (page.id === 'index') {
        assert.ok(!typeOf(graph, 'BreadcrumbList'), 'the home page needs no breadcrumb');
      } else {
        const crumbs = typeOf(graph, 'BreadcrumbList');
        assert.ok(crumbs, `${rel(SITE, pageFile(lang, page))}: no BreadcrumbList`);
        assert.equal(crumbs.itemListElement.length, 2);
        assert.equal(crumbs.itemListElement[0].item, `${SITE_URL}${pagePath(lang, PAGES[0])}`);
        assert.equal(crumbs.itemListElement[1].item, `${SITE_URL}${pagePath(lang, page)}`);
      }
    }
  }
});

test('the home page describes the extension and its FAQ in JSON-LD', () => {
  for (const lang of LANGUAGES) {
    const html = pageOf(lang, PAGES[0]);
    const data = readLocale(lang.locale);
    const graph = graphOf(html);
    const app = typeOf(graph, 'SoftwareApplication');
    assert.ok(app, `${lang.locale}: no SoftwareApplication`);
    assert.equal(app.applicationCategory, 'BrowserApplication');
    assert.match(app.operatingSystem, /Chrome/);
    assert.match(app.operatingSystem, /Edge/);
    assert.equal(app.offers.price, '0');
    assert.equal(app.offers.priceCurrency, 'USD');
    assert.match(app.license, /agpl-3\.0/i);
    assert.equal(app.downloadUrl, 'https://github.com/astonysh/SenderFinder');
    assert.equal(app.softwareVersion, PKG.version);
    const faq = typeOf(graph, 'FAQPage');
    assert.ok(faq, `${lang.locale}: no FAQPage`);
    assert.equal(faq.mainEntity.length, 6);
    assert.equal(faq.mainEntity[0].name, data.index.faq.items[0].q.replace(/\s+/g, ' ').trim());
    assert.ok(faq.mainEntity.every(entry => entry['@type'] === 'Question' && entry.acceptedAnswer.text.length > 20));
  }
});

test('the install page carries a HowTo with every install step', () => {
  for (const lang of LANGUAGES) {
    const data = readLocale(lang.locale);
    const howTo = typeOf(graphOf(pageOf(lang, PAGES.find(p => p.id === 'install'))), 'HowTo');
    assert.ok(howTo, `${lang.locale}: no HowTo`);
    assert.equal(howTo.step.length, data.install.steps.length);
    assert.deepEqual(howTo.step.map(step => step.position), data.install.steps.map((_, i) => i + 1));
    assert.equal(howTo.step[0].name, data.install.steps[0].title);
  }
});

test('the alternative pages and the changelog carry an Article with the site date', () => {
  for (const lang of LANGUAGES) {
    for (const id of ['clearbit', 'rapportive', 'changelog']) {
      const page = PAGES.find(p => p.id === id);
      const graph = graphOf(pageOf(lang, page));
      const article = typeOf(graph, 'Article');
      assert.ok(article, `${lang.locale}/${id}: no Article`);
      assert.equal(article.datePublished, UPDATED);
      assert.equal(article.dateModified, UPDATED);
      assert.equal(article.inLanguage, lang.htmlLang);
      assert.ok(article.headline.length > 0);
    }
  }
});

test('the changelog page is generated from CHANGELOG.md', () => {
  const markdown = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const headings = [...markdown.matchAll(/^## (.+)$/gm)].map(match => match[1]);
  for (const lang of LANGUAGES) {
    const html = pageOf(lang, PAGES.find(p => p.id === 'changelog'));
    assert.equal((html.match(/<h2 id="v/g) || []).length, headings.length, `${lang.locale}: wrong number of versions`);
    for (const heading of headings) assert.ok(html.includes(heading), `${lang.locale}: ${heading} is missing`);
    assert.match(html, /<ul><li>/);
    assert.ok(html.includes(`href="${pagePath(lang, PAGES.find(p => p.id === 'changelog'))}"`), 'the changelog is not linked');
  }
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

test('the sitemap lists each page once per language it exists in, with matching alternates', () => {
  const xml = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => m[1]);
  const expected = CONTENT_PAGES.reduce((sum, page) => sum + pageLocales(page).length, 0);
  assert.equal(blocks.length, expected);
  assert.equal((xml.match(/hreflang="x-default"/g) || []).length, expected);
  for (const page of CONTENT_PAGES) {
    const locales = pageLocales(page);
    const entries = blocks.filter(block => locales.some(code => block.includes(`<loc>${SITE_URL}${pagePath(LANGUAGES.find(l => l.locale === code), page)}</loc>`)));
    assert.equal(entries.length, locales.length, `${page.id}: ${entries.length} sitemap entries`);
    for (const code of locales) {
      const lang = LANGUAGES.find(l => l.locale === code);
      const block = entries.find(entry => entry.includes(`<loc>${SITE_URL}${pagePath(lang, page)}</loc>`));
      assert.ok(block, `sitemap is missing ${pagePath(lang, page)}`);
      assert.equal((block.match(/<xhtml:link /g) || []).length, locales.length + 1);
      const defaultLang = LANGUAGES.find(l => l.locale === locales[0]);
      assert.ok(block.includes(`hreflang="x-default" href="${SITE_URL}${pagePath(defaultLang, page)}"`));
    }
  }
});

test('the 404 page is English-only and stays out of the sitemap', () => {
  const notFound = PAGES.find(p => p.id === '404');
  assert.deepEqual(pageLocales(notFound), ['en']);
  const xml = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  assert.ok(!xml.includes(`${SITE_URL}/404`), 'the 404 page is in the sitemap');
});

/* ---------------------------------------------------------------- English-only content pages */

const CONTENT_IDS = ['benchmark', 'salesnav', 'findByEmail', 'outlook', 'sponsors', 'stats'];
const contentPage = id => PAGES.find(page => page.id === id);
const contentHtml = id => pageOf(LANGUAGES[0], contentPage(id));
const mainText = html => html.match(/<main id="main">([\s\S]*?)<\/main>/)[1]
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

test('the six English-only content pages are built once, in English, with one sitemap entry', () => {
  const xml = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
  for (const id of CONTENT_IDS) {
    const page = contentPage(id);
    assert.deepEqual(pageLocales(page), ['en'], `${id} is not English-only`);
    assert.ok(fs.existsSync(path.join(SITE, pageFile(LANGUAGES[0], page))), `${id}.html is missing`);
    for (const lang of LANGUAGES.filter(l => l.locale !== 'en')) {
      assert.ok(!fs.existsSync(path.join(SITE, pageFile(lang, page))), `${id} was built for ${lang.locale}`);
    }
    assert.equal((xml.match(new RegExp(`<loc>${SITE_URL}${pagePath(LANGUAGES[0], page)}</loc>`, 'g')) || []).length, 1,
      `${id} should have exactly one sitemap entry`);
    const html = contentHtml(id);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE_URL}${pagePath(LANGUAGES[0], page)}">`));
    assert.ok(html.includes(`<link rel="alternate" hreflang="en" href="${SITE_URL}${pagePath(LANGUAGES[0], page)}">`));
    assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${SITE_URL}${pagePath(LANGUAGES[0], page)}">`));
    assert.ok(!html.includes('<link rel="alternate" hreflang="ja"'), `${id} advertises a Japanese version`);
  }
});

test('each content page has an H1, H2 sections, 900–1500 words and a matching FAQPage', () => {
  for (const id of CONTENT_IDS) {
    const html = contentHtml(id);
    assert.match(html, /<h1>/, `${id}: no H1`);
    assert.ok((html.match(/<h2[ >]/g) || []).length >= 5, `${id}: too few H2 sections`);
    const words = (mainText(html).match(/[A-Za-z0-9][A-Za-z0-9'’\-]*/g) || []).length;
    assert.ok(words >= 900 && words <= 1500, `${id}: ${words} words, outside 900–1500`);
    const faqBlock = html.match(/<div class="v2-faq">([\s\S]*?)<\/section>/);
    assert.ok(faqBlock, `${id}: no FAQ block`);
    const faqEntries = (faqBlock[1].match(/<summary>/g) || []).length;
    assert.ok(faqEntries >= 3 && faqEntries <= 5, `${id}: ${faqEntries} FAQ entries, outside 3–5`);
    const faq = typeOf(graphOf(html), 'FAQPage');
    assert.ok(faq, `${id}: no FAQPage JSON-LD`);
    assert.equal(faq.mainEntity.length, faqEntries, `${id}: JSON-LD FAQ does not match the visible FAQ`);
    assert.equal(typeOf(graphOf(html), 'Article').datePublished, UPDATED);
  }
});

test('the benchmark table is generated from the results file', () => {
  const stats = benchStats();
  const html = contentHtml('benchmark');
  assert.match(html, /<td data-label="Step">BlitzAPI<\/td>/);
  assert.ok(html.includes(`<td data-label="Hit rate">${stats.table.rows[0][3]}</td>`), 'the computed hit rate is missing');
  assert.ok(html.includes(`<td data-label="Spend">${stats.table.rows[0][6]}</td>`), 'the computed step spend is missing');
  assert.ok(html.includes(stats.text.totalUsd), 'the computed total is missing from the copy');
  assert.ok(html.includes(stats.text.perAddress), 'the computed per-address figure is missing from the copy');
  assert.ok(html.includes('scripts/bench-stats.js'), 'the table does not say where it comes from');
});

test('the content pages keep their required placeholders and disclosures', () => {
  assert.match(contentHtml('stats'), /<!-- STATS-PLACEHOLDER/);
  assert.match(contentHtml('sponsors'), /There are none yet/);
  assert.match(contentHtml('sponsors'), /TODO-VERIFY: GitHub Sponsors URL \(not created yet as of 2026-10-25\)/);
  assert.match(contentHtml('sponsors'), /mailto:tony@senderfinder\.com/);
  assert.ok(!contentHtml('sponsors').includes('TODO-VERIFY: sponsor contact email'));
  assert.equal(typeOf(graphOf(contentHtml('sponsors')), 'Organization').contactPoint.email, 'tony@senderfinder.com');
  assert.match(contentHtml('sponsors'), /firecrawl\.link\/sf/);
  const salesnav = contentHtml('salesnav');
  assert.match(salesnav, /18 March 2020/, 'the verified retirement date is missing');
  assert.ok(salesnav.includes('techcrunch.com/2020/02/13/'), 'the TechCrunch source is missing');
  assert.ok(salesnav.includes('adweek.com/performance-marketing/'), 'the Adweek source is missing');
  assert.match(salesnav, /<title>LinkedIn retired Sales Navigator for Gmail in 2020/);
  assert.ok(!salesnav.includes('TODO-VERIFY'), 'salesnav still carries a TODO-VERIFY marker');
});

test('the content pages and the two alternatives link to each other', () => {
  const index = pageOf(LANGUAGES[0], PAGES[0]);
  const benchmark = pagePath(LANGUAGES[0], contentPage('benchmark'));
  assert.ok(index.includes(`href="${benchmark}"`), 'the index pricing section does not link to the benchmark');
  for (const id of ['clearbit', 'rapportive']) {
    const html = pageOf(LANGUAGES[0], PAGES.find(page => page.id === id));
    assert.ok(html.includes(`href="${benchmark}"`), `${id} does not link to the benchmark`);
  }
  const bench = contentHtml('benchmark').match(/<article class="v2-prose">([\s\S]*?)<\/article>/)[1];
  for (const id of ['clearbit', 'rapportive', 'salesnav', 'findByEmail']) {
    assert.ok(bench.includes(`href="${pagePath(LANGUAGES[0], contentPage(id))}"`), `the benchmark body does not link to ${id}`);
  }
  for (const id of CONTENT_IDS) {
    assert.ok(contentHtml(id).includes('href="/install"'), `${id} has no install CTA`);
  }
});

test('the footer Resources column links every locale to the English pages', () => {
  for (const lang of LANGUAGES) {
    const html = pageOf(lang, PAGES[0]);
    assert.ok(html.includes('class="v2-foot-resources"'), `${lang.locale}: no Resources column`);
    for (const id of CONTENT_IDS) {
      const href = pagePath(LANGUAGES[0], contentPage(id));
      assert.ok(html.includes(`href="${href}"`), `${lang.locale}: footer does not link to ${id}`);
    }
  }
});

test('no address, profile URL or person name from the benchmark sample is published', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bench', 'wizleads-sample-50.results.json'), 'utf8'));
  const sensitive = [...new Set(rows.flatMap(row => [row.email, row.linkedinUrl, row.profileName].filter(Boolean)))];
  assert.ok(sensitive.length > 100);
  for (const file of walk(SITE).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    for (const value of sensitive) assert.ok(!html.includes(value), `${rel(SITE, file)} contains sample data (${value.slice(0, 12)}…)`);
  }
});

test('every page has the Twitter card tags next to the Open Graph tags', () => {
  for (const lang of LANGUAGES) {
    for (const page of PAGES) {
      if (!hasPage(page, lang.locale)) continue;
      const html = pageOf(lang, page);
      assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), `${lang.locale}/${page.id}: no twitter:card`);
      assert.match(html, /<meta name="twitter:title" content="[^"]+">/, `${lang.locale}/${page.id}: no twitter:title`);
      assert.match(html, /<meta name="twitter:description" content="[^"]+">/, `${lang.locale}/${page.id}: no twitter:description`);
      assert.ok(html.includes(`<meta name="twitter:image" content="${SITE_URL}/assets/screenshots/sender-in-gmail.png">`), `${lang.locale}/${page.id}: no twitter:image`);
      assert.ok(html.includes(`<meta property="og:image" content="${SITE_URL}/assets/screenshots/sender-in-gmail.png">`), `${lang.locale}/${page.id}: og:image changed`);
    }
  }
});
