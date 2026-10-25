// Screenshots of the side panel and the settings page in every bundled UI language, with synthetic data and no keys.
// Chromium on macOS ignores --lang (the UI locale comes from the system), so instead the extension is copied to a
// temp dir with the locale's messages.json installed as the default locale (en): the strings chrome.i18n falls back
// to are then exactly that language. Nothing is asserted
// beyond "renders without a page error"; the point is to eyeball wrapping in long languages (de, fr, pt_BR).
// Usage: npm run e2e:locales [-- ja de]   (PLAYWRIGHT_MODULE=/path/to/node_modules/playwright if not installed here)
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXT = path.join(__dirname, '..', '..', 'extension');
const OUT = path.join(__dirname, '..', '..', 'output', 'playwright', 'locales'); fs.mkdirSync(OUT, { recursive: true });
const FAKE = fs.readFileSync(path.join(__dirname, 'fake-gmail.html'), 'utf8');
const all = fs.readdirSync(path.join(EXT, '_locales')).filter(d => fs.existsSync(path.join(EXT, '_locales', d, 'messages.json')));
const wanted = process.argv.slice(2).filter(a => !a.startsWith('-'));
const locales = wanted.length ? wanted.filter(l => all.includes(l)) : all;
const chromeLang = l => l.replace('_', '-');   // zh_CN → zh-CN

let failed = 0;
for (const loc of locales) {
  const userDir = path.join(os.tmpdir(), 'senderfinder-e2e-locale-' + loc); fs.rmSync(userDir, { recursive: true, force: true });
  const extDir = path.join(os.tmpdir(), 'senderfinder-e2e-ext-' + loc); fs.rmSync(extDir, { recursive: true, force: true });
  fs.cpSync(EXT, extDir, { recursive: true });
  fs.copyFileSync(path.join(EXT, '_locales', loc, 'messages.json'), path.join(extDir, '_locales', 'en', 'messages.json'));
  const ctx = await chromium.launchPersistentContext(userDir, { headless: true, channel: 'chromium', locale: chromeLang(loc),
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`], viewport: { width: 1100, height: 800 } });
  const errors = [];
  try {
    let sw = null; for (let i = 0; i < 60 && !sw; i++) { [sw] = ctx.serviceWorkers(); if (!sw) await new Promise(r => setTimeout(r, 500)); }
    if (!sw) throw new Error('extension service worker did not start');
    await ctx.route('https://mail.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FAKE }));
    for (const host of ['https://api.monid.ai/**', 'https://treg.to/**', 'https://api.firecrawl.dev/**', 'https://telemetry.*/**', 'https://www.linkedin.com/**']) await ctx.route(host, r => r.abort());
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push('gmail: ' + e));
    await page.goto('https://mail.google.com/mail/u/0/#inbox/abc'); await page.waitForSelector('span[data-el-chip]', { timeout: 8000 });
    const tabId = await sw.evaluate(async () => { const tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' }); return tabs[0] && tabs[0].id; });
    const extId = new URL(sw.url()).host;
    const panel = await ctx.newPage(); panel.on('pageerror', e => errors.push('panel: ' + e));
    await panel.setViewportSize({ width: 360, height: 760 }); await panel.goto(`chrome-extension://${extId}/sidepanel.html?tabId=${tabId}`);
    await panel.waitForSelector('.person.primary', { timeout: 8000 });
    await panel.waitForFunction(() => !document.querySelector('.spin'), null, { timeout: 15000 });
    // Jane (signature hit, free) as the subject so the full card with buttons is visible; Peter looked up → "no key" state in a row.
    await page.locator('span[data-el-chip]').nth(0).locator('button').click();
    await panel.waitForFunction(() => { const p = document.querySelector('.person.primary'); return p && p.dataset.email === 'jane.doe@acme-test.invalid'; }, null, { timeout: 8000 });
    await panel.locator('.person.primary button[data-act=lookup]').click();
    await panel.waitForFunction(() => !document.querySelector('.spin'), null, { timeout: 15000 });
    await panel.locator('.others .row[data-email="peter.miller@globex-test.invalid"] button[data-act=lookup]').click();
    await panel.waitForFunction(() => !document.querySelector('.spin'), null, { timeout: 15000 });
    await panel.screenshot({ path: path.join(OUT, `panel-${loc}.png`), fullPage: true });
    const opt = await ctx.newPage(); opt.on('pageerror', e => errors.push('options: ' + e));
    await opt.setViewportSize({ width: 1100, height: 900 }); await opt.goto(`chrome-extension://${extId}/options.html`); await opt.waitForSelector('#steps tr', { timeout: 8000 });
    await opt.screenshot({ path: path.join(OUT, `options-${loc}.png`), fullPage: true });
    // Anything still showing a raw message key means a missing translation.
    const raw = await opt.evaluate(() => [...document.querySelectorAll('[data-i18n]')].filter(el => /^[a-z0-9_]+$/.test(el.textContent.trim()) && el.textContent.trim() === el.dataset.i18n).map(el => el.dataset.i18n));
    if (raw.length) errors.push('untranslated keys shown on options: ' + raw.join(', '));
    console.log(`${errors.length ? 'FAIL' : 'ok'}: ${loc}${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);
  } catch (e) { console.log(`FAIL: ${loc}: ${e.message}`); failed++; }
  finally { await ctx.close().catch(() => {}); fs.rmSync(extDir, { recursive: true, force: true }); }
  if (errors.length) failed++;
}
console.log(failed ? `${failed} locale(s) failed` : `all ${locales.length} locales rendered → ${OUT}`);
process.exitCode = failed ? 1 : 0;
