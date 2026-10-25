import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend, dayOf } from '../extension/core/store.js';

const rec = (email, status = 'found', at = '2026-10-25T08:00:00.000Z', usd = 0.0005) => ({ email, status, nameGiven: 'Jane Doe', source: 'gmail', profile: status === 'found' ? { linkedinUrl: 'https://www.linkedin.com/in/' + email.split('@')[0], fullName: 'Jane Doe' } : null, match: null, cost: { usd, calls: [] }, skippedReason: null, lookedUpAt: at });

test('cache: save, get, list, delete; createdAt survives updates', async () => {
  const store = createStore({ backend: memoryBackend(), now: () => new Date('2026-10-25T09:00:00Z') });
  await store.saveLookup(rec('jane@acme.com'));
  const a = await store.getLookup('jane@acme.com');
  assert.equal(a.status, 'found'); assert.equal(a.createdAt, '2026-10-25T08:00:00.000Z');
  await store.saveLookup({ ...rec('jane@acme.com', 'found', '2026-10-25T08:30:00.000Z') });
  assert.equal((await store.getLookup('jane@acme.com')).createdAt, '2026-10-25T08:00:00.000Z');
  await store.saveLookup(rec('bob@beta.io', 'not_found', '2026-10-24T08:00:00.000Z', 0.03));
  const l = await store.listLookups({ q: 'acme' }); assert.equal(l.total, 1); assert.equal(l.items[0].email, 'jane@acme.com');
  const all = await store.listLookups(); assert.deepEqual(all.items.map(r => r.email), ['jane@acme.com', 'bob@beta.io']);
  assert.equal((await store.listLookups({ status: 'not_found' })).total, 1);
  assert.equal(await store.deleteLookup('bob@beta.io'), 1); assert.equal(await store.deleteLookup('bob@beta.io'), 0);
  assert.equal(await store.getLookup('nobody@x.io'), null);
});

test('ledger: spentToday and per-provider totals; stats shape', async () => {
  let t = new Date('2026-10-25T09:00:00Z');
  const store = createStore({ backend: memoryBackend(), now: () => t, timeZone: 'UTC' });
  await store.recordCall({ email: 'a@b.io', step: 'blitzapi', provider: 'treg:blitzapi', status: 'hit', usd: 0.0005, ms: 500 });
  await store.recordCall({ email: 'a@b.io', step: 'hunter', provider: 'monid:hunter', status: 'miss', usd: 0, ms: 900 });
  await store.recordCall({ email: 'a@b.io', step: 'signature', provider: 'local', status: 'miss', usd: 0, ms: 1 });
  assert.equal(await store.spentToday(), 0.0005);
  await store.saveLookup(rec('a@b.io', 'found', '2026-10-25T08:59:00.000Z', 0.0005));
  const s = await store.stats();
  assert.equal(s.today.lookups, 1); assert.equal(s.today.found, 1); assert.equal(s.today.usd, 0.0005);
  assert.equal(s.daily.length, 30); assert.equal(s.daily[29].day, '2026-10-25'); assert.equal(s.daily[29].usd, 0.0005); assert.equal(s.daily[29].calls, 3);
  assert.deepEqual(s.providers.map(p => p.provider), ['treg:blitzapi', 'monid:hunter']); // local is not a provider row
  t = new Date('2026-10-26T01:00:00Z');
  assert.equal(await store.spentToday(), 0);
  assert.equal(dayOf(new Date('2026-10-25T23:30:00Z'), 'Europe/Berlin'), '2026-10-26');
});

test('prune drops stale and surplus entries; export / import round-trip', async () => {
  const now = new Date('2026-10-25T09:00:00Z');
  const store = createStore({ backend: memoryBackend(), now: () => now, maxEntries: 3, maxAgeDays: 30 });
  for (let i = 0; i < 5; i++) await store.saveLookup(rec(`u${i}@acme.com`, 'found', new Date(now.getTime() - i * 86400000).toISOString()));
  await store.saveLookup(rec('old@acme.com', 'found', '2026-01-01T00:00:00.000Z'));
  assert.equal(await store.prune(), 3);
  const left = await store.listLookups(); assert.deepEqual(left.items.map(r => r.email), ['u0@acme.com', 'u1@acme.com', 'u2@acme.com']);
  const dump = await store.exportAll(); assert.equal(dump.format, 'senderfinder/1'); assert.equal(dump.lookups.length, 3);
  const other = createStore({ backend: memoryBackend(), now: () => now });
  await other.saveLookup(rec('u0@acme.com', 'not_found', '2026-10-26T00:00:00.000Z')); // newer local entry wins
  const r = await other.importAll(dump); assert.equal(r.imported, 2);
  assert.equal((await other.getLookup('u0@acme.com')).status, 'not_found');
  await assert.rejects(other.importAll({ format: 'nope' }), e => e.code === 'BAD_FORMAT');
  await other.clearAll(); assert.equal((await other.listLookups()).total, 0);
});
