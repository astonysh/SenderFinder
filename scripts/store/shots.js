// Chrome Web Store assets, generated from the extension itself with synthetic people (nothing real, no provider call):
//   store/screenshot-1..5.png   1280×800  Gmail mock + side panel, settings pages
//   store/promo-small.png        440×280  required small promo tile
//   store/promo-marquee.png     1400×560  optional marquee tile
// Usage: npm run store:assets   (PLAYWRIGHT_MODULE=/path/to/node_modules/playwright if not installed here)
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = path.join(__dirname, '..', '..');
const EXT = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'store'); fs.mkdirSync(OUT, { recursive: true });
// Screenshots the website uses (site-src/assets/screenshots/ is the source, the generator copies it into site/).
const SITE = path.join(ROOT, 'site-src', 'assets', 'screenshots'); fs.mkdirSync(SITE, { recursive: true });
const slogan = JSON.parse(fs.readFileSync(path.join(EXT, '_locales', 'en', 'messages.json'), 'utf8')).panel_slogan.message;
const sloganHtml = slogan.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace('. ', '.<br>');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-gmail.html'), 'utf8');
const dataUrl = (file, mime) => `data:${mime};base64,` + fs.readFileSync(file).toString('base64');
const png = buf => 'data:image/png;base64,' + buf.toString('base64');

// Synthetic people. The sender is "found" with a full profile so the card shows title, company, location and local time.
const now = new Date().toISOString();
// Locally drawn avatar illustrations for the two people who are "found" in the demo thread. They are served
// from a routed https host below because the panel only renders https photo URLs; nothing is downloaded.
const AVATARS = path.join(ROOT, 'site-src', 'assets', 'avatars');
const avatarHost = 'https://avatars.senderfinder.test';
const avatar = name => `${avatarHost}/${name}.svg`;
const SEED = { format: 'senderfinder/1', exportedAt: now, ledger: [{ day: now.slice(0, 10), usd: 0.0109, calls: 3, hits: 2 }], providers: [], lookups: [
  { email: 'jane.doe@acme-test.invalid', status: 'found', nameGiven: 'Jane Doe', source: 'gmail', skippedReason: null, lookedUpAt: now,
    profile: { linkedinUrl: 'https://www.linkedin.com/in/jane-doe-test', fullName: 'Jane Doe', headline: 'Partnerships · Music & Media', title: 'Head of Partnerships', company: 'Acme', companyDomain: 'acme-test.invalid', location: 'Berlin, Germany', timeZone: 'Europe/Berlin', positions: [{ title: 'Head of Partnerships', company: 'Acme', current: true }], provider: 'treg:blitzapi.people.email.reverse', photoUrl: avatar('jane'), twitterUrl: null },
    match: { provider: 'treg:blitzapi.people.email.reverse', step: 'blitzapi', nameGiven: 'Jane Doe', nameMatched: true, confidence: 'name' },
    cost: { usd: 0.0005, calls: [{ step: 'signature', provider: 'local', status: 'miss', usd: 0, ms: 1 }, { step: 'blitzapi', provider: 'treg:blitzapi.people.email.reverse', status: 'hit', usd: 0.0005, ms: 412 }] } },
  { email: 'peter.miller@globex-test.invalid', status: 'found', nameGiven: 'Peter Miller', source: 'gmail', skippedReason: null, lookedUpAt: now,
    profile: { linkedinUrl: 'https://www.linkedin.com/in/peter-miller-test', fullName: 'Peter Miller', headline: null, title: 'VP Sales EMEA', company: 'Globex', companyDomain: 'globex-test.invalid', location: 'London, United Kingdom', timeZone: 'Europe/London', positions: [], provider: 'monid:hunterio/people/find', photoUrl: avatar('peter'), twitterUrl: null },
    match: { provider: 'monid:hunterio/people/find', step: 'hunter', nameGiven: 'Peter Miller', nameMatched: true, confidence: 'name' },
    cost: { usd: 0.0049, calls: [{ step: 'blitzapi', provider: 'treg:blitzapi.people.email.reverse', status: 'miss', usd: 0, ms: 380 }, { step: 'hunter', provider: 'monid:hunterio/people/find', status: 'hit', usd: 0.0049, ms: 2210 }] } },
] };

const userDir = path.join(os.tmpdir(), 'senderfinder-store-profile'); fs.rmSync(userDir, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(userDir, { headless: true, channel: 'chromium', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
let sw = null; for (let i = 0; i < 60 && !sw; i++) { [sw] = ctx.serviceWorkers(); if (!sw) await new Promise(r => setTimeout(r, 500)); }
if (!sw) throw new Error('extension service worker did not start');
await ctx.route('https://mail.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: MOCK }));
for (const host of ['https://api.monid.ai/**', 'https://treg.to/**', 'https://api.firecrawl.dev/**', 'https://telemetry.*/**', 'https://www.linkedin.com/**']) await ctx.route(host, r => r.abort());
await ctx.route(`${avatarHost}/**`, r => {
  const file = path.join(AVATARS, path.basename(new URL(r.request().url()).pathname));
  if (!file.startsWith(AVATARS) || !fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
  return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: fs.readFileSync(file) });
});
const extId = new URL(sw.url()).host;

// Seed the cache and a demo key through the options page (extension-page-only messages), then open Gmail.
const opt = await ctx.newPage(); await opt.goto(`chrome-extension://${extId}/options.html`); await opt.waitForSelector('#steps tr');
await opt.evaluate(async seed => { await chrome.runtime.sendMessage({ type: 'data:import', data: seed, replace: true }); await chrome.runtime.sendMessage({ type: 'settings:set', patch: { keys: { treg: 'treg_demo_token_0000000000', monid: 'monid_demo_key_0000000000' }, theme: 'light' } }); }, SEED);
const page = await ctx.newPage(); await page.setViewportSize({ width: 920, height: 800 });
await page.goto('https://mail.google.com/mail/u/0/#inbox/abc'); await page.waitForSelector('span[data-el-chip]', { timeout: 8000 });
const tabId = await sw.evaluate(async () => { const tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' }); return tabs[0] && tabs[0].id; });
const panel = await ctx.newPage(); await panel.setViewportSize({ width: 360, height: 800 });
await panel.goto(`chrome-extension://${extId}/sidepanel.html?tabId=${tabId}`); await panel.waitForSelector('.person.primary', { timeout: 8000 });
const settle = () => panel.waitForFunction(() => !document.querySelector('.spin'), null, { timeout: 15000 });
await settle();

// A composite page: Gmail on the left, the side panel on the right, like Chrome shows it.
// Store copies go to store/, the ones the website uses go to site-src/assets/screenshots/.
const compose = async (left, right, file, siteFile) => {
  const c = await ctx.newPage(); await c.setViewportSize({ width: 1280, height: 800 });
  await c.setContent(`<body style="margin:0;background:#fff;display:flex;width:1280px;height:800px;overflow:hidden"><img src="${png(left)}" style="width:920px;height:800px"><div style="width:1px;background:#dadce0"></div><img src="${png(right)}" style="width:359px;height:800px"></body>`);
  const buf = await c.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 } });
  fs.writeFileSync(path.join(OUT, file), buf);
  if (siteFile) fs.writeFileSync(path.join(SITE, siteFile), buf);
  await c.close();
};
// 2. Everyone in the thread: the newest sender (Peter) is the subject, Jane sits in the list with her result.
await compose(await page.screenshot(), await panel.screenshot(), 'screenshot-2-thread.png', 'thread.png');
// 1. Click Jane's chip: she becomes the subject. Title, company, location, local time and profile link.
await page.locator('span[data-el-chip]').nth(0).locator('button').click();
await panel.waitForFunction(() => { const p = document.querySelector('.person.primary'); return p && p.dataset.email === 'jane.doe@acme-test.invalid'; }, null, { timeout: 8000 }); await settle();
await page.waitForTimeout(4500);   // the chip's "open the side panel" hint removes itself after 4 s
const panelShot = await panel.screenshot();
fs.writeFileSync(path.join(SITE, 'side-panel.png'), panelShot);   // the hero card: the panel on its own
await compose(await page.screenshot(), panelShot, 'screenshot-1-sender.png', 'sender-in-gmail.png');
// 3–5. Settings: provider keys, lookup steps + budget, data & privacy.
const shot = async (sel, file, scrollTo, siteFile) => {
  await opt.setViewportSize({ width: 1280, height: 800 }); await opt.reload(); await opt.waitForSelector('#steps tr');
  if (sel) await opt.locator(sel).click();
  if (scrollTo) await opt.evaluate(s => window.scrollTo(0, document.querySelector(s).offsetTop - 84), scrollTo);
  await opt.waitForTimeout(300);
  const buf = await opt.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 } });
  fs.writeFileSync(path.join(OUT, file), buf);
  if (siteFile) fs.writeFileSync(path.join(SITE, siteFile), buf);
};
await shot(null, 'screenshot-3-keys.png', null, 'settings-keys.png');
await shot(null, 'screenshot-4-steps-budget.png', '.card:nth-of-type(2)', 'settings-steps.png');
await shot('[data-tab=data]', 'screenshot-5-data.png', null, 'data-tab.png');

// The website's install guide also needs chrome://extensions with developer mode on (the store kit has no
// use for it, so it is written to site-src only). Synthetic profile: a fresh browser, no bookmarks, no history.
const extPage = await ctx.newPage(); await extPage.setViewportSize({ width: 1280, height: 800 });
await extPage.goto('chrome://extensions/'); await extPage.waitForTimeout(1200);
await extPage.locator('extensions-toolbar cr-toggle#devMode').click();
await extPage.waitForTimeout(1000);
await extPage.screenshot({ path: path.join(SITE, 'load-unpacked.png'), clip: { x: 0, y: 0, width: 1280, height: 470 } });
await extPage.close();

// Promo tiles, rendered from the icon and the slogan.
const icon = dataUrl(path.join(ROOT, 'design', 'icon-1024.png'), 'image/png');
const tile = async (w, h, file, iconPx, titlePx, subPx) => {
  const c = await ctx.newPage(); await c.setViewportSize({ width: w, height: h });
  await c.setContent(`<body style="margin:0;width:${w}px;height:${h}px;background:#f6f6f3;display:flex;align-items:center;justify-content:center;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1b1d22">
    <div style="display:flex;align-items:center;max-width:90%;gap:${Math.round(iconPx * 0.28)}px">
      <img src="${icon}" style="flex-shrink:0;width:${iconPx}px;height:${iconPx}px;border-radius:${Math.round(iconPx * 0.22)}px">
      <div style="min-width:0"><div style="font-size:${titlePx}px;font-weight:700;letter-spacing:-0.02em;line-height:1.1">SenderFinder</div>
      <div style="font-size:${subPx}px;margin-top:${Math.round(subPx * 0.5)}px;color:#3a3d44">${sloganHtml}</div>
      <div style="font-size:${Math.round(subPx * 0.68)}px;margin-top:${Math.round(subPx * 0.45)}px;color:#6c707a">Open source · your own keys · lookup history stays on your device</div></div>
    </div></body>`);
  await c.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: w, height: h } }); await c.close();
};
await tile(440, 280, 'promo-small.png', 112, 34, 16);
await tile(1400, 560, 'promo-marquee.png', 240, 76, 34);
await ctx.close();
console.log('store assets written to', OUT, fs.readdirSync(OUT).filter(f => f.endsWith('.png')).join(', '));
