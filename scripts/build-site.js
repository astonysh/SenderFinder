#!/usr/bin/env node
/* Generates site/ from site-src/: one template per page, one JSON file per language.
   Zero dependencies, Node >= 22, ESM. Usage: npm run site  (or node scripts/build-site.js --out <dir>)

   site/ is committed output: Cloudflare Pages builds nothing, it just serves the folder.
   Every page exists in every language, English at the root, the others under a locale prefix. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, FALLBACK_VOLUMES, MODES, estimate, makeFormatters } from '../site-src/assets/calc.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, '..');
export const SRC = path.join(ROOT, 'site-src');
export const SITE_URL = 'https://senderfinder.com';
export const CONFIG = JSON.parse(fs.readFileSync(path.join(SRC, 'site.config.json'), 'utf8'));
export const UPDATED = '2026-10-25'; // last content change, used in sitemap.xml

/* The ten languages of the extension (_locales in manifest.json), in this order.
   `name` is always written in its own language: that is what the language switcher shows. */
export const LANGUAGES = [
  { locale: 'en', htmlLang: 'en', hreflang: 'en', dir: '', name: 'English' },
  { locale: 'zh_CN', htmlLang: 'zh-CN', hreflang: 'zh-CN', dir: 'zh-cn', name: '简体中文' },
  { locale: 'zh_TW', htmlLang: 'zh-TW', hreflang: 'zh-TW', dir: 'zh-tw', name: '繁體中文' },
  { locale: 'ja', htmlLang: 'ja', hreflang: 'ja', dir: 'ja', name: '日本語' },
  { locale: 'ko', htmlLang: 'ko', hreflang: 'ko', dir: 'ko', name: '한국어' },
  { locale: 'de', htmlLang: 'de', hreflang: 'de', dir: 'de', name: 'Deutsch' },
  { locale: 'fr', htmlLang: 'fr', hreflang: 'fr', dir: 'fr', name: 'Français' },
  { locale: 'es', htmlLang: 'es', hreflang: 'es', dir: 'es', name: 'Español' },
  { locale: 'it', htmlLang: 'it', hreflang: 'it', dir: 'it', name: 'Italiano' },
  { locale: 'pt_BR', htmlLang: 'pt-BR', hreflang: 'pt-BR', dir: 'pt-br', name: 'Português (Brasil)' },
];

/* Pages. `path` is the canonical URL path without the .html suffix; `out` is the file on disk. */
export const PAGES = [
  { id: 'index', template: 'index.html', out: 'index.html', path: '/', meta: 'meta.index', ogType: 'website', sitemap: true, script: true },
  { id: 'install', template: 'install.html', out: 'install.html', path: '/install', meta: 'meta.install', ogType: 'article', sitemap: true },
  { id: 'privacy', template: 'privacy.html', out: 'privacy.html', path: '/privacy', meta: 'meta.privacy', ogType: 'article', sitemap: true },
  { id: 'clearbit', template: 'clearbit-connect-alternative.html', out: 'clearbit-connect-alternative.html', path: '/clearbit-connect-alternative', meta: 'meta.clearbit', ogType: 'article', sitemap: true },
  { id: 'rapportive', template: 'rapportive-alternative.html', out: 'rapportive-alternative.html', path: '/rapportive-alternative', meta: 'meta.rapportive', ogType: 'article', sitemap: true },
  // 404 is English only: Cloudflare Pages serves one file for every missing path.
  { id: '404', template: '404.html', out: '404.html', path: '/404', meta: 'meta.notFound', ogType: 'website', noindex: true },
];

export const CONTENT_PAGES = PAGES.filter(p => !p.noindex);

/* ---------- template engine: {{key}}, {{#each list}}…{{/each}}, {{#if value}}…{{/if}} ---------- */

const lookup = (scopes, key) => {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i];
    if (key === 'this' || key === '.') return scope;
    if (scope && typeof scope === 'object') {
      let cur = scope;
      let ok = true;
      for (const part of key.split('.')) {
        if (cur && typeof cur === 'object' && Object.hasOwn(cur, part)) cur = cur[part];
        else { ok = false; break; }
      }
      if (ok) return cur;
    }
  }
  return undefined;
};

const truthy = v => !(v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && v.length === 0));

function sliceBlock(tpl, start, kind) {
  let i = start;
  let depth = 0;
  while (i < tpl.length) {
    const open = tpl.indexOf('{{', i);
    if (open < 0) break;
    const close = tpl.indexOf('}}', open);
    if (close < 0) break;
    const tag = tpl.slice(open + 2, close).trim();
    if (tag.startsWith('#each') || tag.startsWith('#if')) depth++;
    else if (tag === '/each' || tag === '/if') {
      if (depth === 0) {
        if (tag !== '/' + kind.slice(1)) throw new Error(`template: {{${tag}}} closes {{#${kind.slice(1)}}}`);
        return { body: tpl.slice(start, open), next: close + 2 };
      }
      depth--;
    }
    i = close + 2;
  }
  throw new Error(`template: unclosed {{#${kind}}}`);
}

function render(tpl, scopes, file = 'template', depth = 0) {
  if (depth > 8) throw new Error(`${file}: template recursion too deep`);
  let out = '';
  let i = 0;
  while (i < tpl.length) {
    const open = tpl.indexOf('{{', i);
    if (open < 0) { out += tpl.slice(i); break; }
    out += tpl.slice(i, open);
    const close = tpl.indexOf('}}', open);
    if (close < 0) throw new Error(`${file}: unclosed {{ at ${open}`);
    const tag = tpl.slice(open + 2, close).trim();

    if (tag.startsWith('#each ') || tag.startsWith('#if ')) {
      const kind = tag.slice(0, tag.indexOf(' ')); // '#each' | '#if'
      const key = tag.slice(tag.indexOf(' ') + 1).trim();
      const { body, next } = sliceBlock(tpl, close + 2, kind);
      const value = lookup(scopes, key);
      if (kind === '#each') {
        if (!Array.isArray(value)) throw new Error(`${file}: {{#each ${key}}} is not a list`);
        for (const item of value) out += render(body, [...scopes, item], file, depth + 1);
      } else if (truthy(value)) {
        out += render(body, [...scopes, value], file, depth + 1);
      }
      i = next;
      continue;
    }
    if (tag.startsWith('/')) throw new Error(`${file}: stray {{${tag}}}`);

    const value = lookup(scopes, tag);
    if (value === undefined) throw new Error(`${file}: no value for {{${tag}}}`);
    if (value === null) { i = close + 2; continue; }
    if (typeof value === 'object') throw new Error(`${file}: {{${tag}}} is an object, use {{#each}}`);
    // Locale strings may contain their own placeholders, e.g. "…<a href="{{url.install}}">"
    const text = String(value);
    out += text.includes('{{') ? render(text, scopes, file, depth + 1) : text;
    i = close + 2;
  }
  return out;
}

/* ---------- helpers ---------- */

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const localeDir = lang => (lang.dir ? `/${lang.dir}` : '');
export const pagePath = (lang, page) => (page.path === '/' ? `${localeDir(lang)}/` : `${localeDir(lang)}${page.path}`);
export const pageFile = (lang, page) => (lang.dir ? `${lang.dir}/${page.out}` : page.out);
const relHref = (fromFile, toFile) => path.posix.relative(path.posix.dirname(fromFile), toFile) || '.';

const t = (data, key) => {
  const value = key.split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), data);
  if (value === undefined) throw new Error(`locale: missing key "${key}"`);
  return value;
};

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/* Locale data + the variables the templates and the locale strings can use.
   `calc.fallbackGroups` is computed here, so the no-JS table can never drift from calc.js. */
export function scopeFor(lang, data) {
  const fmt = makeFormatters(lang.htmlLang);
  const url = {
    index: 'index.html',
    install: 'install.html',
    privacy: 'privacy.html',
    clearbit: 'clearbit-connect-alternative.html',
    rapportive: 'rapportive-alternative.html',
  };
  const calc = {
    ...data.calc,
    fallbackIntro: fill(data.calc.fallbackIntro, { skip: fmt.percent(DEFAULTS.skipShare) }),
    fallbackGroups: [
      { mode: 'both', key: 'both' },
      { mode: 'treg', key: 'treg' },
      { mode: 'monid', key: 'monid' },
    ].map(group => ({
      title: data.calc['mode' + group.key[0].toUpperCase() + group.key.slice(1)],
      rows: FALLBACK_VOLUMES.map(perDay => {
        const result = estimate({ perDay, mode: group.mode, skipShare: DEFAULTS.skipShare });
        return {
          volume: fill(data.calc.perDay, { n: fmt.count(perDay) }),
          cost: fill(data.calc.fallbackCost, { cost: fmt.monthly(result.monthlyUsd) }),
          hit: fill(data.calc.fallbackHit, { hit: fmt.percent(result.found) }),
        };
      }),
    })),
  };
  const pages = {
    index: {
      ...data.index,
      how: { ...data.index.how, steps: withIcons(data.index.how.steps, HOW_ICONS) },
      cost: { ...data.index.cost, blocks: withIcons(data.index.cost.blocks, COST_ICONS) },
      privacy: {
        ...data.index.privacy,
        facts: data.index.privacy.facts.map((text, i) => ({ text, icon: FACT_ICONS[i] })),
      },
      providers: {
        ...data.index.providers,
        items: data.index.providers.items.map((item, i) => ({ ...item, logo: PROVIDER_LOGOS[i] })),
      },
    },
  };
  const ext = readExtensionStrings(lang.locale);
  // the hero highlights the brand word with the gradient; every locale's slogan contains it
  const at = ext.slogan.indexOf('LinkedIn');
  const heroSlogan = at >= 0
    ? { before: ext.slogan.slice(0, at), after: ext.slogan.slice(at + 'LinkedIn'.length) }
    : { before: ext.slogan, after: '' };
  const steps = { treg: 'BlitzAPI → QuickEnrich', monid: 'Hunter → Apollo', both: 'BlitzAPI → Hunter → QuickEnrich → Apollo' };
  const pricing = {
    cards: ['treg', 'both', 'monid'].map(mode => {
      const result = estimate({ mode, perDay: DEFAULTS.perDay, skipShare: DEFAULTS.skipShare });
      const best = {
        treg: data.install.whichKeyRows[0][4],
        both: data.install.whichKeyRows[2][4],
        monid: data.install.whichKeyRows[1][4],
      }[mode];
      return {
        mode,
        name: data.calc['mode' + mode[0].toUpperCase() + mode.slice(1)],
        price: fmt.perAddress(result.perAddress),
        hit: fmt.percent(result.found),
        steps: steps[mode],
        best,
        recommended: mode === 'both',
      };
    }),
  };
  const faq = { items: data.index.faq.items.slice(0, 6) };
  return { ...data, ...pages, url, base: lang.dir ? '../' : '', calc, install: installScope(data.install), ext, heroSlogan, pricing, faq };
}

/* The key-comparison table: cells carry their column label so the phone layout can show it. */
function installScope(install) {
  return {
    ...install,
    steps: withIcons(install.steps, INSTALL_STEP_ICONS).map((step, i) => ({ ...step, number: i + 1 })),
    whichKeyRows: install.whichKeyRows.map((row, r) => ({
      cells: row.map((value, i) => ({ label: install.whichKeyHead[i], value, logo: i === 0 ? INSTALL_ROW_LOGOS[r] : null })),
    })),
  };
}

/* Icons are picked by position, never stored in the locale files: translators only see text. */
const HOW_ICONS = ['download', 'key', 'mail'];
const COST_ICONS = ['users', 'mail-off'];
const FACT_ICONS = ['eye-off', 'mail-off', 'github'];   // only facts that are not already in the two lists
const PROVIDER_LOGOS = ['monid.svg', 'treg.svg', 'firecrawl.png', null];
const INSTALL_STEP_ICONS = ['download', 'puzzle', 'key', 'check', 'mail'];
const INSTALL_ROW_LOGOS = ['treg.svg', 'monid.svg', null, 'firecrawl.png'];

const withIcons = (steps, icons) => steps.map((step, i) => ({ ...step, icon: icons[i] || 'check' }));

/* ---------- page shell: head, header with the language switcher, footer ---------- */

function head(lang, page, data, scope) {
  const url = SITE_URL + pagePath(lang, page);
  const meta = t(data, page.meta);
  // The landing page is titled after the extension's slogan; other pages keep their own title.
  const title = page.id === 'index' ? `SenderFinder — ${scope.ext.slogan}` : meta.title;
  const ogTitle = page.id === 'index' ? title : (meta.ogTitle || meta.title);
  const lines = [
    '<!doctype html>',
    `<html lang="${lang.htmlLang}">`,
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${esc(title)}</title>`,
    `  <meta name="description" content="${esc(meta.description)}">`,
    `  <link rel="canonical" href="${url}">`,
  ];
  if (!page.noindex) {
    for (const other of LANGUAGES) {
      lines.push(`  <link rel="alternate" hreflang="${other.hreflang}" href="${SITE_URL}${pagePath(other, page)}">`);
    }
    lines.push(`  <link rel="alternate" hreflang="x-default" href="${SITE_URL}${pagePath(LANGUAGES[0], page)}">`);
  }
  lines.push('  <!-- CWS-BUTTON: install buttons carry data-store-url="CWS_PLACEHOLDER"; see site/README.md -->');
  lines.push(`  <meta property="og:type" content="${page.ogType}">`);
  lines.push('  <meta property="og:site_name" content="SenderFinder">');
  lines.push(`  <meta property="og:title" content="${esc(ogTitle)}">`);
  lines.push(`  <meta property="og:description" content="${esc(meta.ogDescription || meta.description)}">`);
  lines.push(`  <meta property="og:url" content="${url}">`);
  lines.push(`  <meta property="og:image" content="${SITE_URL}/assets/screenshots/sender-in-gmail.png">`);
  lines.push('  <meta property="og:image:width" content="1280">');
  lines.push('  <meta property="og:image:height" content="800">');
  if (page.noindex) lines.push('  <meta name="robots" content="noindex">');
  lines.push('  <meta name="color-scheme" content="light dark">');
  lines.push(`  <script src="${scope.base}assets/theme-boot.js"></script>`);
  lines.push(`  <link rel="stylesheet" href="${scope.base}assets/app.css">`);
  lines.push(`  <link rel="icon" href="${scope.base}assets/favicon.svg" type="image/svg+xml">`);
  lines.push(`  <link rel="icon" href="${scope.base}assets/icon-128.png" type="image/png" sizes="128x128">`);
  lines.push(`  <link rel="apple-touch-icon" href="${scope.base}assets/icon-128.png">`);

  lines.push(`  <script type="module" src="${scope.base}assets/theme.js"></script>`);
  if (page.script) lines.push(`  <script type="module" src="${scope.base}assets/calc.js"></script>`);
  lines.push('</head>');
  return lines.join('\n');
}

/* One stroke style for the whole set: the line icons inherit fill="none" + stroke="currentColor" from their
   symbol, so they follow the text colour in both themes. Symbols that are meant to be solid (the GitHub
   mark) or to fill a shape (the cookie dots) say so themselves. */
const sprite = () => {
  const symbols = fs.readFileSync(path.join(SRC, 'partials', 'icons.svg'), 'utf8').trim()
    .replace(/<symbol ([^>]*?)data-solid="true"/g, '<symbol $1 fill="currentColor" stroke="none"')
    .replace(/<symbol /g, '<symbol fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ');
  return `<svg class="icon-sprite" aria-hidden="true" focusable="false" width="0" height="0" xmlns="http://www.w3.org/2000/svg">\n${symbols}\n</svg>`;
};

function header(lang, page, data, scope) {
  const nav = [
    { href: 'index.html#how', label: data.ui.nav.how },
    { href: 'index.html#cost', label: data.ui.nav.cost },
    { href: 'install.html', label: data.ui.nav.install, id: 'install' },
    { href: 'privacy.html', label: data.ui.nav.privacy, id: 'privacy' },
    { href: 'index.html#faq', label: data.ui.nav.faq },
    { href: 'https://github.com/astonysh/SenderFinder', label: 'GitHub' },
  ];
  const items = nav.map(item => {
    const current = item.id && item.id === page.id ? ' aria-current="page"' : '';
    return `          <li><a href="${item.href}"${current}>${esc(item.label)}</a></li>`;
  }).join('\n');

  const languages = LANGUAGES.map(other => {
    // The 404 page exists in English only, so its language links go to the home page of each language.
    const href = page.noindex
      ? relHref(pageFile(lang, page), pageFile(other, PAGES[0]))
      : relHref(pageFile(lang, page), pageFile(other, page));
    const current = other.locale === lang.locale ? ' aria-current="page"' : '';
    return `              <li><a href="${href}" hreflang="${other.hreflang}" lang="${other.htmlLang}"${current}>${other.name}</a></li>`;
  }).join('\n');

  const brandCurrent = page.id === 'index' ? ' aria-current="page"' : '';
  return `  <a class="skip-link" href="#main">${esc(data.ui.skip)}</a>

  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="index.html"${brandCurrent}>
        <img src="${scope.base}assets/icon-128.png" alt="" width="32" height="32">
        <span>SenderFinder</span>
      </a>
      <nav class="site-nav" aria-label="${esc(data.ui.navLabel)}">
        <ul>
${items}
        </ul>
      </nav>
      <div class="header-tools">
        <button type="button" class="theme-switch" data-label-light="${esc(data.ui.theme.label)}: ${esc(data.ui.theme.light)}" data-label-dark="${esc(data.ui.theme.label)}: ${esc(data.ui.theme.dark)}" aria-label="${esc(data.ui.theme.label)}"><svg class="i theme-icon theme-icon-light" aria-hidden="true"><use href="#i-sun"/></svg><svg class="i theme-icon theme-icon-dark" aria-hidden="true"><use href="#i-moon"/></svg></button>
        <details class="lang-switch">
          <summary><svg class="i" aria-hidden="true"><use href="#i-globe"/></svg><span class="visually-hidden">${esc(data.ui.language)}: </span>${lang.name}</summary>
          <div class="lang-menu">
            <nav aria-label="${esc(data.ui.language)}">
              <ul>
${languages}
              </ul>
            </nav>
            <p class="fine">${esc(data.ui.languageHint)}</p>
          </div>
        </details>
      </div>
    </div>
  </header>`;
}

function footer(lang, page, data, scope) {
  const links = [
    { href: 'https://github.com/astonysh/SenderFinder', label: 'GitHub' },
    { href: 'install.html', label: data.ui.footer.install },
    { href: 'privacy.html', label: data.ui.footer.privacy },
    { href: 'clearbit-connect-alternative.html', label: data.ui.footer.clearbit, id: 'clearbit' },
    { href: 'rapportive-alternative.html', label: data.ui.footer.rapportive, id: 'rapportive' },
    { href: 'https://github.com/astonysh/SenderFinder/blob/main/LICENSE', label: data.ui.footer.license },
  ].map(item => {
    const current = item.id === page.id ? ' aria-current="page"' : '';
    return `          <li><a href="${item.href}"${current}>${esc(item.label)}</a></li>`;
  }).join('\n');
  return `  <footer class="site-footer">
    <div class="wrap">
      <nav aria-label="${esc(data.ui.footerNavLabel)}">
        <ul>
${links}
        </ul>
      </nav>
      <p class="footer-privacy"><svg class="i" aria-hidden="true"><use href="#i-lock"/></svg> ${esc(data.ui.footer.privacyLine)} <a href="privacy.html">${esc(data.ui.footer.privacy)}</a></p>
      <p>${esc(data.ui.footer.built)}</p>
      <p>${esc(data.ui.footer.disclaimer)}</p>
      <p>${esc(data.ui.footer.trademarks)}</p>
    </div>
  </footer>`;
}

/* Informational, not a consent banner: the site sets no cookies, so there is nothing to accept.
   Hidden by default; theme.js reveals it unless localStorage says it was dismissed. */
function notice(data) {
  const actions = CONFIG.consentMode
    ? `<button type="button" class="notice-btn notice-accept" data-consent="granted">${esc(data.ui.notice.accept)}</button>
        <button type="button" class="notice-btn notice-reject" data-consent="denied">${esc(data.ui.notice.reject)}</button>`
    : `<button type="button" class="notice-btn notice-close" data-consent="ack">${esc(data.ui.notice.ok)}</button>`;
  return `  <div class="notice" id="notice" role="region" aria-label="${esc(data.ui.notice.aria)}" data-consent-mode="${CONFIG.consentMode ? 'true' : 'false'}" hidden>
    <div class="notice-inner">
      <svg class="i i-lg" aria-hidden="true"><use href="#i-cookie"/></svg>
      <p>${esc(data.ui.notice.text)} <a href="privacy.html#cookies">${esc(data.ui.notice.link)}</a></p>
      <div class="notice-actions">
        ${actions}
      </div>
    </div>
  </div>`;
}

/* Marketing layout (index only for now): same controls and accessibility hooks as the default header,
   different classes and order — brand, centred links, then the theme and language switchers. */
function headerV2(lang, page, data, scope) {
  const nav = [
    { href: 'index.html#how', label: data.ui.nav.how },
    { href: 'index.html#privacy', label: data.ui.nav.privacy },
    { href: 'index.html#cost', label: data.ui.nav.cost },
    { href: 'install.html', label: data.ui.nav.install, id: 'install' },
    { href: 'index.html#faq', label: data.ui.nav.faq },
    { href: 'https://github.com/astonysh/SenderFinder', label: 'GitHub' },
  ];
  const items = nav.map(item => {
    const current = item.id && item.id === page.id ? ' aria-current="page"' : '';
    return `            <li><a href="${item.href}"${current}>${esc(item.label)}</a></li>`;
  }).join('\n');
  const languages = LANGUAGES.map(other => {
    // the 404 page exists in English only: its language links go to each language's home page
    const target = page.noindex ? pageFile(other, PAGES[0]) : pageFile(other, page);
    const href = relHref(pageFile(lang, page), target);
    const current = other.locale === lang.locale ? ' aria-current="page"' : '';
    return `                <li><a href="${href}" hreflang="${other.hreflang}" lang="${other.htmlLang}"${current}>${other.name}</a></li>`;
  }).join('\n');
  return `  <a class="skip-link" href="#main">${esc(data.ui.skip)}</a>

  <header class="v2-nav">
    <div class="v2-wrap">
      <div class="v2-nav-inner">
        <a class="v2-brand" href="index.html" aria-current="page">
          <img src="${scope.base}assets/icon-128.png" alt="" width="32" height="32">
          <span>SenderFinder</span>
        </a>

        <nav class="v2-nav-links" aria-label="${esc(data.ui.navLabel)}">
          <ul>
${items}
          </ul>
        </nav>

        <div class="v2-nav-tools header-tools">
          <button type="button" class="theme-switch" data-label-light="${esc(data.ui.theme.label)}: ${esc(data.ui.theme.light)}" data-label-dark="${esc(data.ui.theme.label)}: ${esc(data.ui.theme.dark)}" aria-label="${esc(data.ui.theme.label)}"><svg class="i theme-icon theme-icon-light" aria-hidden="true"><use href="#i-sun"/></svg><svg class="i theme-icon theme-icon-dark" aria-hidden="true"><use href="#i-moon"/></svg></button>
          <details class="lang-switch">
            <summary><svg class="i" aria-hidden="true"><use href="#i-globe"/></svg><span class="visually-hidden">${esc(data.ui.language)}: </span>${lang.name}</summary>
            <div class="lang-menu">
              <nav aria-label="${esc(data.ui.language)}">
                <ul>
${languages}
                </ul>
              </nav>
              <p class="fine">${esc(data.ui.languageHint)}</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  </header>`;
}

function footerV2(lang, page, data) {
  const links = [
    { href: 'install.html', label: data.ui.footer.install },
    { href: 'privacy.html', label: data.ui.footer.privacy },
    { href: 'clearbit-connect-alternative.html', label: data.ui.footer.clearbit },
    { href: 'rapportive-alternative.html', label: data.ui.footer.rapportive },
    { href: 'https://github.com/astonysh/SenderFinder', label: 'GitHub' },
    { href: 'https://github.com/astonysh/SenderFinder/blob/main/LICENSE', label: data.ui.footer.license },
  ].map(item => `        <li><a href="${item.href}">${esc(item.label)}</a></li>`).join('\n');
  return `  <footer class="v2-foot">
    <div class="v2-wrap v2-foot-inner">
      <a class="v2-brand" href="index.html">
        <img src="${lang.dir ? '../' : ''}assets/icon-128.png" alt="" width="32" height="32">
        <span>SenderFinder</span>
      </a>
      <ul class="v2-foot-links">
${links}
      </ul>
      <p class="v2-foot-privacy"><svg class="i" aria-hidden="true"><use href="#i-lock"/></svg> ${esc(data.ui.footer.privacyLine)} <a href="privacy.html">${esc(data.ui.footer.privacy)}</a></p>
      <div class="v2-foot-bottom">
        <p>${esc(data.ui.footer.built)}</p>
        <p>${esc(data.ui.footer.trademarks)}</p>
      </div>
    </div>
  </footer>`;
}

function sitemap() {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  for (const page of CONTENT_PAGES) {
    for (const lang of LANGUAGES) {
      out.push('  <url>');
      out.push(`    <loc>${SITE_URL}${pagePath(lang, page)}</loc>`);
      out.push(`    <lastmod>${UPDATED}</lastmod>`);
      for (const other of LANGUAGES) {
        out.push(`    <xhtml:link rel="alternate" hreflang="${other.hreflang}" href="${SITE_URL}${pagePath(other, page)}"/>`);
      }
      out.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${pagePath(LANGUAGES[0], page)}"/>`);
      out.push('  </url>');
    }
  }
  out.push('</urlset>', '');
  return out.join('\n');
}

/* ---------- build ---------- */

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
};

/* Marketing layout (adapted from ixartz/SaaS-Boilerplate): its own strings live outside the locale files
   while the design is being reviewed, so the locale parity check keeps covering the pages that ship. */
export function hasMarketing(locale) {
  return locale === 'en' && fs.existsSync(path.join(SRC, 'locales', `index-v2.${locale}.json`));
}

export function readLocale(locale) {
  return JSON.parse(fs.readFileSync(path.join(SRC, 'locales', `${locale}.json`), 'utf8'));
}

/* The hero headline and its sub-line are the extension's own strings: panel_slogan and tagline from
   extension/_locales/<locale>/messages.json. Read at build time so the two never drift apart. */
export function readExtensionStrings(locale) {
  const file = path.join(ROOT, 'extension', '_locales', locale, 'messages.json');
  const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pick = key => {
    const value = messages[key] && messages[key].message;
    if (!value) throw new Error(`${file}: missing "${key}"`);
    return value;
  };
  return { slogan: pick('panel_slogan'), tagline: pick('tagline') };
}

export function buildSite(outDir, { locales = LANGUAGES.map(l => l.locale) } = {}) {
  const templates = new Map();
  const template = name => {
    if (!templates.has(name)) templates.set(name, fs.readFileSync(path.join(SRC, 'pages', name), 'utf8'));
    return templates.get(name);
  };

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  let pages = 0;
  for (const lang of LANGUAGES.filter(l => locales.includes(l.locale))) {
    const data = readLocale(lang.locale);
    const scope = scopeFor(lang, data);
    const pageList = lang.locale === 'en' ? PAGES : PAGES.filter(p => !p.noindex);
    for (const page of pageList) {
      const main = render(template(page.template), [scope], `${lang.locale}/${page.template}`);
      const html = [
        head(lang, page, data, scope),
        '<body class="v2">',
        sprite(),
        headerV2(lang, page, data, scope),
        '',
        `<main id="main">`,
        main.trimEnd(),
        '</main>',
        '',
        footerV2(lang, page, data, scope),
        '',
        notice(data),
        '</body>',
        '</html>',
        '',
      ].join('\n');
      const file = path.join(outDir, pageFile(lang, page));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, html);
      pages++;
    }
  }

  copyDir(path.join(SRC, 'assets'), path.join(outDir, 'assets'));
  // The header avatar and the PNG favicon are the extension's own icon, copied so it never goes stale.
  fs.copyFileSync(path.join(ROOT, 'extension', 'icons', 'icon128.png'), path.join(outDir, 'assets', 'icon-128.png'));
  // Provider logos come from the extension so the site and the settings page show the same marks.
  fs.mkdirSync(path.join(outDir, 'assets', 'vendors'), { recursive: true });
  for (const logo of ['treg.svg', 'monid.svg', 'firecrawl.png']) {
    fs.copyFileSync(path.join(ROOT, 'extension', 'icons', 'vendors', logo), path.join(outDir, 'assets', 'vendors', logo));
  }
  fs.copyFileSync(path.join(SRC, '_headers'), path.join(outDir, '_headers'));
  fs.copyFileSync(path.join(SRC, 'robots.txt'), path.join(outDir, 'robots.txt'));
  fs.copyFileSync(path.join(SRC, 'THIRD_PARTY_NOTICES.md'), path.join(outDir, 'THIRD_PARTY_NOTICES.md'));
  fs.copyFileSync(path.join(SRC, 'README.md'), path.join(outDir, 'README.md'));
  // Workers Static Assets reads .assetsignore: the README ships in the repository but not on the site.
  fs.copyFileSync(path.join(SRC, '.assetsignore'), path.join(outDir, '.assetsignore'));
  fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap());
  return { pages };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outArg = process.argv.indexOf('--out');
  const outDir = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'site');
  // --langs en,ja builds a subset: handy while writing copy, never used for the committed output.
  const langsArg = process.argv.indexOf('--langs');
  const locales = langsArg > 0 ? process.argv[langsArg + 1].split(',') : undefined;
  const { pages } = buildSite(outDir, locales ? { locales } : undefined);
  console.log(`site: ${pages} pages in ${path.relative(ROOT, outDir) || '.'} (${LANGUAGES.length} languages × ${CONTENT_PAGES.length} pages + 404)`);
}
