import test from 'node:test';
import assert from 'node:assert/strict';
import { bump, buildPayload, pendingDays, staleDays, emptyDay, newInstallId, MAX_PENDING_DAYS } from '../extension/core/telemetry.js';
import { parseDaily } from '../telemetry/worker.js';

const found = (over = {}) => ({ ok: true, email: 'jane@acme.com', status: 'found', cached: false, profile: { linkedinUrl: 'https://www.linkedin.com/in/jane', fullName: 'Jane Doe' },
  cost: { usd: 0.0054, calls: [{ step: 'signature', provider: 'local', status: 'miss', usd: 0 }, { step: 'blitzapi', provider: 'treg:blitzapi', status: 'miss', usd: 0 }, { step: 'hunter', provider: 'monid:hunter', status: 'hit', usd: 0.0049 }, { step: 'apollo', provider: 'monid:apollo', status: 'skipped', reason: 'lookup_budget', usd: 0 }] }, ...over });

test('bump counts statuses, steps, sources and spend; never copies identifying fields', () => {
  let d = bump(undefined, found(), 'gmail');
  d = bump(d, found({ status: 'not_found', profile: null, cost: { usd: 0.03, calls: [{ step: 'hunter', status: 'error', error: 'HTTP_500', usd: 0 }] } }), 'outlook');
  d = bump(d, found({ cached: true }), 'gmail');
  d = bump(d, { ok: false, error: 'NO_KEYS' }, 'gmail');
  d = bump(d, found({ status: 'skipped', cost: { usd: 0, calls: [] } }), 'weird');
  assert.equal(d.lookups, 4); assert.equal(d.found, 2); assert.equal(d.not_found, 1); assert.equal(d.skipped, 1); assert.equal(d.cached, 1);
  assert.equal(d.usd, 0.0354);
  assert.deepEqual(d.steps, { signature: { calls: 1, hits: 0, errors: 0 }, blitzapi: { calls: 1, hits: 0, errors: 0 }, hunter: { calls: 2, hits: 1, errors: 1 } });
  assert.deepEqual(d.sources, { gmail: 1, outlook: 1, other: 1 });
  const json = JSON.stringify(buildPayload({ day: '2026-10-25', counters: d, installId: 'abc', version: '0.2.0', lang: 'zh-CN' }));
  for (const leak of ['acme', 'jane', 'Jane', 'linkedin.com', 'HTTP_500']) assert.ok(!json.includes(leak), 'payload leaks ' + leak);
});

test('bump does not mutate its input', () => {
  const a = emptyDay(); const b = bump(a, found(), 'gmail');
  assert.equal(a.lookups, 0); assert.equal(b.lookups, 1); assert.deepEqual(a.steps, {});
});

test('buildPayload has exactly the documented fields', () => {
  const p = buildPayload({ day: '2026-10-25', counters: bump(null, found(), 'gmail'), installId: 'id', version: '0.2.0', lang: 'en' });
  assert.deepEqual(Object.keys(p).sort(), ['cached', 'day', 'found', 'install', 'lang', 'lookups', 'not_found', 'skipped', 'sources', 'steps', 'uncertain', 'usd', 'v', 'version'].sort());
  assert.equal(p.v, 1); assert.equal(p.usd, 0.0054);
});

test('pendingDays sends only completed days inside the retry window', () => {
  const days = { '2026-10-25': {}, '2026-10-24': {}, '2026-10-01': {}, '2026-10-11': {}, '2026-10-12': {} };
  assert.deepEqual(pendingDays(days, '2026-10-25'), ['2026-10-11', '2026-10-12', '2026-10-24']);
  assert.deepEqual(staleDays(days, '2026-10-25'), ['2026-10-01']);
  assert.equal(MAX_PENDING_DAYS, 14);
});

test('newInstallId is a UUID-ish string', () => { assert.match(newInstallId(), /^[0-9a-f-]{32,36}$/i); });

test('worker parseDaily accepts a real payload and rejects malformed ones', () => {
  const today = new Date().toISOString().slice(0, 10);
  const good = buildPayload({ day: today, counters: bump(null, found(), 'gmail'), installId: 'A0000000-0000-4000-8000-000000000000', version: '0.2.0', lang: 'zh-CN' });
  const r = parseDaily(good);
  assert.equal(r.ok, true); assert.equal(r.row.install, 'a0000000-0000-4000-8000-000000000000'); assert.equal(r.row.found, 1); assert.deepEqual(r.row.sources, { gmail: 1 });
  const bad = [
    [null, 'not_an_object'], [[], 'not_an_object'], [{ ...good, v: 2 }, 'unsupported_version'], [{ ...good, install: 'x' }, 'bad_install'],
    [{ ...good, day: '2026-13-01' }, 'bad_day'], [{ ...good, day: '2020-01-01' }, 'day_out_of_range'], [{ ...good, lookups: -1 }, 'bad_lookups'],
    [{ ...good, lookups: 1.5 }, 'bad_lookups'], [{ ...good, usd: -1 }, 'bad_usd'], [{ ...good, steps: { 'Bad Step': { calls: 1, hits: 0, errors: 0 } } }, 'bad_steps'],
    [{ ...good, steps: { hunter: { calls: 'x' } } }, 'bad_steps'], [{ ...good, sources: { email: 1 } }, 'bad_sources'],
  ];
  for (const [b, e] of bad) assert.equal(parseDaily(b).error, e, JSON.stringify(b).slice(0, 80));
  const odd = parseDaily({ ...good, version: '<script>', lang: 'zh_CN!', steps: undefined, sources: undefined });
  assert.equal(odd.ok, true); assert.equal(odd.row.version, ''); assert.equal(odd.row.lang, ''); assert.deepEqual(odd.row.steps, {});
});
