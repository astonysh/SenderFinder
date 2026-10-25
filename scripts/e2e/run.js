// Browser end-to-end check with synthetic data: loads the extension into headless Chromium, opens a fake
// Gmail page (intercepting mail.google.com) with NO provider keys configured, and checks: one inline chip per message
// and nothing else in the page, the side panel shows the newest sender (free-mail → skipped) and the other people,
// a chip click changes the subject, signature hit for free, NO_KEYS error for a paid lookup, cache after reload,
// the Connect flow, the empty state and the options page.
// No network call to any provider happens. Usage: npm run e2e   (PLAYWRIGHT_MODULE=/path/to/node_modules/playwright if not installed here)
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXT = path.join(__dirname, '..', '..', 'extension');
const OUT = path.join(__dirname, '..', '..', 'output', 'playwright'); fs.mkdirSync(OUT, { recursive: true });
const FAKE = fs.readFileSync(path.join(__dirname, 'fake-gmail.html'), 'utf8');
const FAKE_LI = fs.readFileSync(path.join(__dirname, 'fake-linkedin.html'), 'utf8');
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); };

const userDir = path.join(os.tmpdir(), 'senderfinder-e2e-profile'); fs.rmSync(userDir, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(userDir, { headless: true, channel: 'chromium', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1100, height: 800 } });
// Some Playwright builds never emit the 'serviceworker' event for a worker that started during launch: poll instead.
let sw = null; for (let i = 0; i < 60 && !sw; i++) { [sw] = ctx.serviceWorkers(); if (!sw) await new Promise(r => setTimeout(r, 500)); }
if (!sw) throw new Error('extension service worker did not start');
const swErrors = []; sw.on('console', m => { if (m.type() === 'error') swErrors.push(m.text()); });
await ctx.route('https://mail.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FAKE }));
await ctx.route('https://www.linkedin.com/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FAKE_LI }));
// Any provider call would be a bug here: fail loudly.
for (const host of ['https://api.monid.ai/**', 'https://treg.to/**', 'https://api.firecrawl.dev/**', 'https://telemetry.*/**']) await ctx.route(host, r => { console.error('FAIL: provider called', r.request().url()); process.exitCode = 1; r.abort(); });

const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('https://mail.google.com/mail/u/0/#inbox/abc'); await page.waitForSelector('span[data-el-chip]', { timeout: 8000 });
const chips = page.locator('span[data-el-chip]');
const chipEmails = await chips.evaluateAll(els => els.map(e => e.getAttribute('data-el-chip')));
assert(chipEmails.length === 3 && chipEmails[0] === 'jane.doe@acme-test.invalid', 'three chips, one per message: ' + chipEmails.join(', '));
assert((await page.locator('.gE span[data-el-chip]').count()) === 3 && (await page.locator('div[data-el-card]').count()) === 0, 'nothing but the inline chip is inserted into the mail page');
// The side panel, pinned to the Gmail tab (the real panel follows the active tab; the harness passes ?tabId=).
const gmailTabId = await sw.evaluate(async () => { const tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' }); return tabs[0] && tabs[0].id; });
assert(typeof gmailTabId === 'number', 'service worker sees the Gmail tab');
const extId = new URL(sw.url()).host;
const panel = await ctx.newPage(); panel.on('pageerror', e => errors.push('panel: ' + e)); panel.on('console', m => { if (m.type() === 'error') errors.push('panel: ' + m.text()); });
await panel.setViewportSize({ width: 360, height: 760 }); await panel.goto(`chrome-extension://${extId}/sidepanel.html?tabId=${gmailTabId}`); await panel.waitForSelector('.person.primary', { timeout: 8000 });
const primary = panel.locator('.person.primary'); const others = panel.locator('.others .row');
const settle = () => panel.waitForFunction(() => !document.querySelector('.spin'), null, { timeout: 15000 });
const pstate = () => primary.evaluate(e => e.dataset.status + ' | ' + e.dataset.email + ' | ' + e.innerText.replace(/\s+/g, ' ').trim());
await settle(); console.log(await pstate());
assert((await pstate()).startsWith('skipped | someone@gmail.com'), 'panel: the newest sender was auto-processed and skipped as free mail');
const otherEmails = await others.evaluateAll(els => els.map(e => e.dataset.email));
assert(otherEmails.length === 3 && otherEmails.includes('jane.doe@acme-test.invalid') && otherEmails.includes('peter.miller@globex-test.invalid') && otherEmails.includes('sam.rivera@acme-test.invalid'), 'panel: others = Jane, Peter, Sam; noreply and me filtered: ' + otherEmails.join(', '));
assert((await others.evaluateAll(els => els.map(e => e.dataset.status))).every(x => x === 'idle'), 'older senders and recipients are NOT looked up automatically');
assert(await panel.locator('#status').isVisible(), 'panel warns that no provider key is set');
await panel.screenshot({ path: path.join(OUT, 'sidepanel-1-skipped.png'), fullPage: true });
await page.screenshot({ path: path.join(OUT, 'gmail-1-chips.png'), fullPage: true });
// Click Jane's chip in the mail page: she becomes the subject without spending anything. (Headless Chromium cannot
// open the real side panel from the API, so the chip falls back to the toolbar hint; the state change is what matters.)
await chips.nth(0).locator('button').click();
await panel.waitForFunction(() => { const p = document.querySelector('.person.primary'); return p && p.dataset.email === 'jane.doe@acme-test.invalid'; }, null, { timeout: 8000 });
assert((await pstate()).startsWith('idle | jane.doe@acme-test.invalid'), 'chip click makes Jane the subject, nothing is looked up yet');
assert((await others.evaluateAll(els => els.map(e => e.dataset.email))).includes('someone@gmail.com'), 'the previous subject moved to the others list');
// Look Jane up from the panel: signature link → found, $0, no provider call.
await primary.locator('button[data-act=lookup]').click(); await settle();
const jane = await pstate(); console.log(jane);
assert(jane.startsWith('found | jane.doe@acme-test.invalid') && jane.includes('$0'), 'Jane found for free from the signature');
assert((await primary.locator('a.li').getAttribute('href')) === 'https://www.linkedin.com/in/jane-doe-test', 'profile link normalised');
assert((await primary.locator('button[data-act=connect]').count()) === 1, 'found person offers the Connect button');
assert((await primary.locator('.avatar.ini').innerText()) === 'JD', 'no provider photo → initials avatar "JD"');
assert((await chips.nth(0).evaluate(e => e.shadowRoot.querySelector('.dot').className)) === 'dot found', 'the chip in the mail page turns green');
await panel.screenshot({ path: path.join(OUT, 'sidepanel-2-found.png'), fullPage: true });
// Peter's chip → Peter is the subject, Jane moves to the others list WITH her cached result and the same actions as the main card.
// Two "first click does nothing" regressions ride on this click:
//  (b) the worker must ask the side panel to open BEFORE it awaits anything, or the user gesture has expired after a cold
//      start: slow down chrome.storage.session.set in the worker and time the open() call against the chip click;
//  (a) the panel:state push that this click produces must not rebuild a panel button while it is pressed.
await sw.evaluate(() => {
  const ss = chrome.storage.session, origSet = ss.set.bind(ss);
  globalThis.__e2e = { origSet, origOpen: chrome.sidePanel && chrome.sidePanel.open, opens: [] };
  ss.set = async (...a) => { await new Promise(r => setTimeout(r, 400)); return origSet(...a); };
  if (chrome.sidePanel) chrome.sidePanel.open = async () => { globalThis.__e2e.opens.push(Date.now()); throw new Error('headless: no side panel'); };
});
await panel.evaluate(() => { const b = document.querySelector('.person.primary button[data-act=connect]'); window.__held = b; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
const chipT0 = Date.now();
await chips.nth(1).locator('button').click();
await panel.waitForTimeout(700);
const held = await panel.evaluate(() => ({ same: document.querySelector('.person.primary button[data-act=connect]') === window.__held, email: document.querySelector('.person.primary').dataset.email }));
assert(held.same && held.email === 'jane.doe@acme-test.invalid', 'a state push while a panel button is pressed does not rebuild the button under the pointer');
await panel.evaluate(() => window.__held.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
const opens = await sw.evaluate(() => globalThis.__e2e.opens);
assert(opens.length === 1 && opens[0] - chipT0 < 300, 'side panel open() is requested before the worker awaits anything (' + (opens.length ? opens[0] - chipT0 : 'never') + ' ms after the chip click)');
await sw.evaluate(() => { chrome.storage.session.set = globalThis.__e2e.origSet; if (chrome.sidePanel) chrome.sidePanel.open = globalThis.__e2e.origOpen; });
await panel.waitForFunction(() => { const p = document.querySelector('.person.primary'); return p && p.dataset.email === 'peter.miller@globex-test.invalid'; }, null, { timeout: 8000 });
const janeRow = panel.locator('.others .row[data-email="jane.doe@acme-test.invalid"]');
const janeRowText = await janeRow.innerText(); console.log('jane row:', janeRowText.replace(/\s+/g, ' '));
assert((await janeRow.getAttribute('data-status')) === 'found' && !/\bnull\b/.test(janeRowText), 'found participant row renders without stray "null"');
assert((await janeRow.locator('a[href="https://www.linkedin.com/in/jane-doe-test"]').count()) >= 1 && (await janeRow.locator('button[data-act=connect]').count()) === 1, 'participant row offers the profile link and Connect');
await panel.screenshot({ path: path.join(OUT, 'sidepanel-4-row-found.png'), fullPage: true });
await janeRow.locator('button[data-act=details]').click();
await panel.waitForFunction(() => { const p = document.querySelector('.person.primary'); return p && p.dataset.email === 'jane.doe@acme-test.invalid'; }, null, { timeout: 8000 });
assert((await pstate()).startsWith('found | jane.doe@acme-test.invalid'), 'Details on a participant row makes that person the main card (cached, nothing spent)');
// Connect without the linkedin.com permission: the one-time permission page opens with the note preview; cancel closes it.
const [connPage] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), primary.locator('button[data-act=connect]').click()]);
await connPage.waitForLoadState(); await connPage.waitForSelector('#note', { timeout: 8000 }); await connPage.waitForTimeout(300);
connPage.on('pageerror', e => errors.push('connect: ' + e));
const noteText = await connPage.locator('#note').innerText(); console.log('connect page note:', noteText.replace(/\n/g, ' | '));
assert(connPage.url().endsWith('/connect.html') && noteText.includes('Jane') && noteText.includes('SenderFinder'), 'connect.html opened with the prefilled note (first name + signature)');
await connPage.screenshot({ path: path.join(OUT, 'connect-permission.png'), fullPage: true });
await connPage.locator('#cancel').click(); await page.waitForTimeout(300);
assert(connPage.isClosed(), 'cancel closes the permission page');
// The LinkedIn page helper, run against a synthetic profile page with a stubbed chrome.* (the optional permission
// cannot be granted headlessly). It must NOT click Connect itself; once the user does, Add a note → textarea prefilled.
const li = await ctx.newPage(); li.on('pageerror', e => errors.push('linkedin: ' + e));
await li.addInitScript(() => { const c = window.chrome || (window.chrome = {}); c.runtime = { sendMessage: async m => ((window.__sent = window.__sent || []).push(m.type), m.type === 'connect:job' ? { ok: true, job: { note: 'Hi Jane, we were just in touch by email.\n\n— sent via SenderFinder', name: 'Jane Doe' } } : { ok: true }) }; c.i18n = { getMessage: k => k }; });
await li.goto('https://www.linkedin.com/in/jane-doe-test'); await li.addScriptTag({ path: path.join(EXT, 'content', 'linkedin.js') });
await li.waitForSelector('[data-el-connect-banner]', { timeout: 8000 }); await li.waitForTimeout(3000);
assert((await li.locator('.artdeco-modal').count()) === 0 && (await li.locator('[data-el-connect-banner]').evaluate(e => e.shadowRoot.textContent)).includes('li_instructions'), 'helper never clicks Connect itself; it asks the user to');
await li.locator('#connect').click();   // the user clicks Connect
await li.waitForSelector('textarea#custom-message', { timeout: 10000 }); await li.waitForTimeout(300);
const liNote = await li.locator('textarea#custom-message').inputValue();
assert(liNote.startsWith('Hi Jane') && liNote.endsWith('SenderFinder'), 'after the user clicks Connect, the helper opens Add a note and prefills the note');
assert((await li.title()).startsWith('typed:'), 'input event dispatched (framework-style value set)');
assert((await li.locator('[data-el-connect-banner]').evaluate(e => e.shadowRoot.textContent)).includes('li_filled'), 'banner tells the user to review and press Send');
assert((await li.title()) !== 'SENT', 'Send was NOT clicked by the helper');
assert(!(await li.evaluate(() => window.__sent || [])).includes('li:invited'), 'nothing reported as sent before the user presses Send');
await li.evaluate(() => { const find = r => { for (const el of r.querySelectorAll('*')) { if (el.id === 'send') return el; if (el.shadowRoot) { const x = find(el.shadowRoot); if (x) return x; } } return null; }; find(document).click(); });
await li.waitForTimeout(1200);
assert((await li.evaluate(() => window.__sent || [])).includes('li:invited'), 'user pressed Send → helper reports the invitation as sent (side panel shows "Pending")');
await li.screenshot({ path: path.join(OUT, 'linkedin-prefilled.png'), fullPage: true }); await li.close();
// Peter (others list): needs a paid provider → NO_KEYS error, nothing spent.
const peterRow = panel.locator('.others .row[data-email="peter.miller@globex-test.invalid"]');
await peterRow.locator('button[data-act=lookup]').click(); await settle();
assert((await peterRow.getAttribute('data-status')) === 'error' && (await peterRow.locator('.badge.err').count()) === 1, 'Peter: no keys → clear error in his row');
await panel.screenshot({ path: path.join(OUT, 'sidepanel-3-others.png'), fullPage: true });
// A key is added while the panel is open: the stale "no key set" result disappears by itself (no reload, no click).
const primaryBefore = await primary.getAttribute('data-status');
await panel.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...(settings || {}), keys: { ...((settings || {}).keys || {}), treg: 'treg_test_token_0123456789' } } }); });
await panel.waitForFunction(() => { const r = document.querySelector('.others .row[data-email="peter.miller@globex-test.invalid"]'); return r && r.dataset.status === 'idle'; }, null, { timeout: 8000 });
assert(await panel.locator('#status').isHidden(), 'adding a key hides the "no key" banner without reopening the panel');
assert((await primary.getAttribute('data-status')) === primaryBefore, 'adding a key leaves the main card alone when it was not a key error');
await panel.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...settings, keys: { ...settings.keys, treg: '' } } }); });
await panel.waitForFunction(() => !document.getElementById('status').hidden, null, { timeout: 8000 });
// Reload the mail page: the thread is re-sent, the newest sender is the subject again and Jane comes from the cache (IndexedDB).
await page.reload(); await page.waitForSelector('span[data-el-chip]', { timeout: 8000 });
await panel.waitForFunction(() => { const p = document.querySelector('.person.primary'); return p && p.dataset.email === 'someone@gmail.com'; }, null, { timeout: 8000 }); await settle();
const janeRow2 = panel.locator('.others .row[data-email="jane.doe@acme-test.invalid"]');
assert((await janeRow2.getAttribute('data-status')) === 'found' && (await janeRow2.locator('a').first().getAttribute('href')) === 'https://www.linkedin.com/in/jane-doe-test', 'cached result served after reload');
await page.screenshot({ path: path.join(OUT, 'gmail-2-chips-after-reload.png'), fullPage: true });
// A tab without an open email → empty state.
const empty = await ctx.newPage(); empty.on('pageerror', e => errors.push('panel-empty: ' + e)); await empty.setViewportSize({ width: 360, height: 760 }); await empty.goto(`chrome-extension://${extId}/sidepanel.html?tabId=999999`); await empty.waitForSelector('.empty', { timeout: 8000 });
assert((await empty.locator('.person').count()) === 0, 'panel shows the empty state for a tab without an open email');
await empty.screenshot({ path: path.join(OUT, 'sidepanel-0-empty.png'), fullPage: true }); await empty.close();

// options
const opt = await ctx.newPage(); opt.on('pageerror', e => errors.push('options: ' + e)); opt.on('console', m => { if (m.type() === 'error') errors.push('options: ' + m.text()); });
await opt.goto(`chrome-extension://${extId}/options.html`); await opt.waitForSelector('#steps tr', { timeout: 8000 });
assert((await opt.locator('#steps tr').count()) === 8, 'options: 8 steps listed');
await opt.waitForFunction(() => (document.getElementById('connect-preview').textContent || '').length > 0, null, { timeout: 5000 });
const prev = await opt.locator('#connect-preview').innerText();
assert(prev.includes('Rahul') && prev.includes('SenderFinder') && prev.length <= 300, 'options: connect note preview uses the sample name and stays within 300 chars');
assert((await opt.locator('#connect-perm').getAttribute('data-granted')) === 'false', 'options: linkedin.com permission shown as not granted');
await opt.fill('#connectNote', 'Hello {first} from {company}!'); await opt.locator('#connectNote').dispatchEvent('change'); await opt.waitForTimeout(400);
assert((await opt.locator('#connect-preview').innerText()).startsWith('Hello Rahul from Rapportive!'), 'options: custom template is saved and previewed');
await opt.fill('#connectNote', ''); await opt.locator('#connectNote').dispatchEvent('change'); await opt.waitForTimeout(300);
assert(await opt.locator('#telemetry').isChecked(), 'options: anonymous usage statistics switch is on by default');
await opt.fill('#key-treg', 'treg_test_token_0123456789'); await opt.locator('#key-treg').dispatchEvent('change'); await opt.waitForTimeout(300);
assert((await opt.locator('#steps tr').nth(1).innerText()).includes('configured'), 'options: entering a treg token marks treg steps as configured');
assert((await opt.locator('.vendor[data-vendor=treg]').getAttribute('data-configured')) === 'true' && (await opt.locator('.vendor[data-vendor=monid]').getAttribute('data-configured')) === 'false', 'options: the treg box turns configured, Monid stays missing');
assert((await opt.locator('.vendor[data-vendor=treg] .vendor-steps li').count()) === 3 && await opt.locator('#keys-need').isHidden(), 'options: the treg box lists its three steps and the "add a key" hint goes away');
await opt.fill('#key-treg', ''); await opt.locator('#key-treg').dispatchEvent('change'); await opt.waitForTimeout(300);
assert(await opt.locator('#keys-need').isVisible(), 'options: with no key at all the "add at least one" hint is shown');
await opt.screenshot({ path: path.join(OUT, 'options-1-settings.png'), fullPage: true });
await opt.locator('[data-tab=history]').click(); await opt.waitForTimeout(400);
assert((await opt.locator('#h-rows tr').count()) === 1, 'options: history lists the one cached lookup (misses without keys are not cached)');
await opt.screenshot({ path: path.join(OUT, 'options-2-history.png'), fullPage: true });
await opt.locator('[data-tab=stats]').click(); await opt.waitForTimeout(400); await opt.screenshot({ path: path.join(OUT, 'options-3-stats.png'), fullPage: true });
await opt.locator('[data-tab=data]').click(); await opt.waitForTimeout(200); await opt.screenshot({ path: path.join(OUT, 'options-4-data.png'), fullPage: true });
await opt.setViewportSize({ width: 390, height: 800 }); await opt.locator('[data-tab=settings]').click(); await opt.waitForTimeout(200); await opt.screenshot({ path: path.join(OUT, 'options-5-mobile.png'), fullPage: true });

// Reload the extension while the mail tab stays open: the orphaned content script must go quiet, not throw.
await sw.evaluate(() => chrome.runtime.reload()); await page.waitForTimeout(2500);
await page.evaluate(() => { document.body.append(document.createElement('div')); }); await page.waitForTimeout(800);
assert(!errors.some(e => /context invalidated/i.test(e)), 'no "Extension context invalidated" error after reloading the extension with Gmail open');
assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
assert(swErrors.length === 0, 'no service-worker errors' + (swErrors.length ? ': ' + swErrors.join(' | ') : ''));
await ctx.close();
console.log(process.exitCode ? 'E2E FAILED' : 'E2E PASSED', '→ screenshots in', OUT);
