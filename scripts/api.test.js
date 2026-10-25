'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createStore } = require('../server/db');
const { createLookup } = require('../server/waterfall');
const { createApp } = require('../server/index');
const { fakeTreg, fakeMonid, fakeFirecrawl } = require('./fakes');

const TOKEN = 'test-token-0123456789abcdef';
async function boot() {
  const store = createStore({ file: ':memory:' });
  const treg = fakeTreg({ answers: { 'blitzapi.people.email.reverse': { data: { person: { linkedin_url: 'https://www.linkedin.com/in/janedoe', full_name: 'Jane Doe', title: 'CTO', company_name: 'Acme' } } } } });
  const monid = fakeMonid(), firecrawl = fakeFirecrawl();
  const config = { steps: ['signature', 'blitzapi', 'hunter'], lookupMaxUsd: 0.05, dailyCapUsd: 2, skipFreeMail: true };
  const svc = createLookup({ store, config, monid, treg, firecrawl });
  const handler = createApp({ store, lookupService: svc, appToken: TOKEN, webDir: null, log: () => {}, providers: { monid, treg, firecrawl } });
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, path, body, headers = {}) => fetch(base + path, { method, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, body: await r.json(), headers: r.headers }));
  return { server, base, call, store, treg };
}

test('API: auth, lookup, history, stats, delete', async t => {
  const { server, base, call } = await boot();
  t.after(() => server.close());
  const h = await fetch(base + '/api/health').then(r => r.json());
  assert.equal(h.ok, true); assert.deepEqual(h.providers, { monid: true, treg: true, firecrawl: true });
  const no = await fetch(base + '/api/stats').then(r => r.status); assert.equal(no, 401);
  const bad = await fetch(base + '/api/stats', { headers: { Authorization: 'Bearer wrong' } }).then(r => r.status); assert.equal(bad, 401);
  const r = await call('POST', '/api/lookup', { email: 'jane@acme.com', name: 'Jane Doe', source: 'web' });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'found'); assert.equal(r.body.profile.linkedinUrl, 'https://www.linkedin.com/in/janedoe');
  const inv = await call('POST', '/api/lookup', { email: 'x' }); assert.equal(inv.status, 400); assert.equal(inv.body.error, 'INVALID_EMAIL');
  const list = await call('GET', '/api/lookups?q=acme'); assert.equal(list.body.total, 1); assert.equal(list.body.items[0].source, 'web');
  const st = await call('GET', '/api/stats'); assert.equal(st.body.today.lookups, 1); assert.equal(st.body.budget.dailyCapUsd, 2); assert.equal(st.body.daily.length, 30);
  const steps = await call('GET', '/api/steps'); assert.deepEqual(steps.body.steps.map(s => s.id), ['signature', 'blitzapi', 'hunter']);
  const del = await call('DELETE', '/api/lookups/jane%40acme.com'); assert.equal(del.body.removed, 1);
  const batch = await call('POST', '/api/lookup/batch', { items: [{ email: 'jane@acme.com' }, { email: 'bad' }] });
  assert.equal(batch.body.results[0].status, 'found'); assert.equal(batch.body.results[1].ok, false);
});

test('API: CORS only for extension origins', async t => {
  const { server, base } = await boot();
  t.after(() => server.close());
  const ext = 'chrome-extension://' + 'a'.repeat(32);
  const pre = await fetch(base + '/api/lookup', { method: 'OPTIONS', headers: { Origin: ext } });
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), ext);
  const web = await fetch(base + '/api/health', { headers: { Origin: 'https://evil.example' } });
  assert.equal(web.headers.get('access-control-allow-origin'), null);
});
