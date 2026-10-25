const path = require('path'); const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXT = path.join(__dirname, '..', '..', 'extension');
const OUT = path.join(__dirname, '..', '..', 'output', 'playwright'); fs.mkdirSync(OUT, { recursive: true });
const FAKE = fs.readFileSync(path.join(__dirname, 'fake-gmail.html'), 'utf8');
const SERVER = process.env.E2E_SERVER || 'http://127.0.0.1:3391', TOKEN = process.env.E2E_TOKEN || 'smoke-token-0123456789abcdef';
(async () => {
  const userDir = path.join(require('os').tmpdir(), 'email-linkedin-e2e-profile'); fs.rmSync(userDir, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(userDir, { headless: true, channel: 'chromium', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1100, height: 800 } });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate(({ SERVER, TOKEN }) => chrome.storage.local.set({ serverUrl: SERVER, token: TOKEN, autoLookup: false, showCost: true }), { SERVER, TOKEN });
  await ctx.route('https://mail.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FAKE }));
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('https://mail.google.com/mail/u/0/#inbox/abc'); await page.waitForSelector('div[data-el-card]', { timeout: 8000 });
  const cards = page.locator('div[data-el-card]'); console.log('cards injected:', await cards.count(), 'emails:', await cards.evaluateAll(els => els.map(e => e.dataset.elCard)));
  await page.screenshot({ path: path.join(OUT, 'gmail-1-idle.png'), fullPage: true });
  for (let i = 0; i < 3; i++) { await cards.nth(i).locator('button', { hasText: '查 LinkedIn' }).click(); }
  await page.waitForFunction(() => [...document.querySelectorAll('div[data-el-card]')].every(c => !c.shadowRoot.querySelector('.spin')), null, { timeout: 15000 });
  const texts = await cards.evaluateAll(els => els.map(e => e.shadowRoot.querySelector('.card').className + ' | ' + e.shadowRoot.querySelector('.card').innerText.replace(/\s+/g, ' ').trim()));
  texts.forEach(t => console.log('card:', t));
  const link = await cards.nth(0).locator('a').getAttribute('href'); console.log('first card link:', link);
  await page.screenshot({ path: path.join(OUT, 'gmail-2-results.png'), fullPage: true });
  // "仍然查询" on the gmail.com card -> forced lookup -> not_found (no providers configured)
  await cards.nth(2).locator('button', { hasText: '仍然查询' }).click();
  await page.waitForFunction(() => !document.querySelectorAll('div[data-el-card]')[2].shadowRoot.querySelector('.spin'), null, { timeout: 15000 });
  console.log('gmail.com card after force:', await cards.nth(2).evaluate(e => e.shadowRoot.querySelector('.card').innerText.replace(/\s+/g, ' ').trim()));
  // popup
  const extId = new URL(sw.url()).host; const pop = await ctx.newPage(); await pop.goto(`chrome-extension://${extId}/popup.html`); await pop.waitForTimeout(300);
  await pop.click('#test'); await pop.waitForFunction(() => /连接|无法|令牌/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
  console.log('popup status:', await pop.textContent('#status')); await pop.screenshot({ path: path.join(OUT, 'popup.png') });
  // web app
  const web = await ctx.newPage(); await web.goto(SERVER + '/'); await web.evaluate(t => { localStorage.setItem('el.token', t); }, TOKEN); await web.goto(SERVER + '/#/lookup'); await web.reload(); await web.waitForTimeout(600);
  await web.screenshot({ path: path.join(OUT, 'web-1-lookup.png'), fullPage: true });
  const emailInput = web.locator('input[type="email"], input[name="email"], input[placeholder*="@"]').first(); await emailInput.fill('jane.doe@acme-test.invalid');
  const submit = web.locator('button[type="submit"], form button').first(); await submit.click(); await web.waitForTimeout(1200);
  await web.screenshot({ path: path.join(OUT, 'web-2-result.png'), fullPage: true });
  await web.goto(SERVER + '/#/history'); await web.waitForTimeout(800); await web.screenshot({ path: path.join(OUT, 'web-3-history.png'), fullPage: true });
  await web.goto(SERVER + '/#/stats'); await web.waitForTimeout(800); await web.screenshot({ path: path.join(OUT, 'web-4-stats.png'), fullPage: true });
  await web.setViewportSize({ width: 390, height: 800 }); await web.goto(SERVER + '/#/lookup'); await web.waitForTimeout(600); await web.screenshot({ path: path.join(OUT, 'web-5-mobile.png'), fullPage: true });
  console.log('page errors:', errors.length ? errors : 'none');
  await ctx.close();
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
