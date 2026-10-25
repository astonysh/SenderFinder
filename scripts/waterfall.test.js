import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../extension/core/store.js';
import { createLookup } from '../extension/core/waterfall.js';
import { fakeTreg, fakeMonid, fakeFirecrawl, notConfigured } from './fakes.js';

const cfg = (over = {}) => ({ steps: ['signature', 'blitzapi', 'hunter', 'quickenrich', 'apollo', 'websearch', 'datalegion'], lookupMaxUsd: 0.05, dailyCapUsd: 2, skipFreeMail: true, ...over });
const mk = ({ treg, monid, firecrawl, config } = {}) => {
  const store = createStore({ backend: memoryBackend() });
  const t = treg || fakeTreg(), m = monid || fakeMonid(), f = firecrawl || fakeFirecrawl();
  return { store, treg: t, monid: m, firecrawl: f, svc: createLookup({ store, config: cfg(config), monid: m, treg: t, firecrawl: f }) };
};
const blitzHit = { data: { found: true, person: { linkedin_url: 'https://www.linkedin.com/in/janedoe', full_name: 'Jane Doe', headline: 'Head of Partnerships at Acme', experiences: [{ job_title: 'Head of Partnerships', company_name: 'Acme', company_domain: 'acme.com', job_is_current: true }] } } };

test('signature link wins for free, nothing paid is called', async () => {
  const { svc, treg, monid } = mk();
  const r = await svc.lookup({ email: 'jane@acme.com', name: 'Jane Doe', signature: '--\nJane\nlinkedin.com/in/janedoe' });
  assert.equal(r.status, 'found'); assert.equal(r.profile.linkedinUrl, 'https://www.linkedin.com/in/janedoe'); assert.equal(r.cost.usd, 0);
  assert.equal(r.match.step, 'signature'); assert.equal(treg.calls.length, 0); assert.equal(monid.calls.length, 0);
});

test('cheapest provider first; a hit stops the waterfall and is cached', async () => {
  const treg = fakeTreg({ answers: { 'blitzapi.people.email.reverse': blitzHit } });
  const { svc, monid, store } = mk({ treg });
  const r = await svc.lookup({ email: 'Jane@Acme.com', name: 'Jane Doe', source: 'gmail' });
  assert.equal(r.status, 'found'); assert.equal(r.cached, false); assert.equal(r.match.nameMatched, true); assert.equal(r.match.confidence, 'name');
  assert.equal(r.profile.company, 'Acme'); assert.equal(r.profile.title, 'Head of Partnerships');
  assert.equal(r.cost.usd, 0.0005); assert.equal(r.cost.calls.length, 1); assert.equal(monid.calls.length, 0);
  const again = await svc.lookup({ email: 'jane@acme.com' });
  assert.equal(again.cached, true); assert.equal(treg.calls.length, 1);
  assert.equal((await store.stats()).allTime.lookups, 1);
});

test('misses fall through to hunter and apollo; name is passed to apollo; not_found when all miss', async () => {
  const monid = fakeMonid({ answers: { 'hunterio/people/find': null, 'apollo/people/match': { output: { person: { name: 'Jane Doe', linkedin_url: null, title: null, organization: null } } } }, prices: { 'apollo/people/match': 0.026 } });
  const { svc } = mk({ monid });
  const r = await svc.lookup({ email: 'jane@acme.com', name: 'Jane Doe' });
  assert.equal(r.status, 'not_found');
  assert.deepEqual(r.cost.calls.map(c => c.step), ['blitzapi', 'hunter', 'quickenrich', 'apollo', 'websearch', 'datalegion']);
  const apollo = monid.calls.find(c => c.provider === 'apollo');
  assert.deepEqual(apollo.input.queryParams, { email: 'jane@acme.com', name: 'Jane Doe', domain: 'acme.com' });
  assert.equal(r.cost.usd, 0.026); // apollo stub billed, others free misses
});

test('hunter answer shape is mapped to a profile', async () => {
  const monid = fakeMonid({ answers: { 'hunterio/people/find': { output: { data: { name: { fullName: 'Jane Doe' }, employment: { title: 'CTO', name: 'Acme', domain: 'acme.com' }, linkedin: { handle: 'janedoe' } } } } } });
  const { svc } = mk({ monid });
  const r = await svc.lookup({ email: 'jane@acme.com' });
  assert.equal(r.status, 'found'); assert.equal(r.profile.linkedinUrl, 'https://www.linkedin.com/in/janedoe'); assert.equal(r.profile.title, 'CTO');
  assert.equal(r.match.nameMatched, null); assert.equal(r.match.confidence, 'exact');
});

test('a name mismatch is kept as fallback: later providers still run, a matching name wins', async () => {
  const treg = fakeTreg({ answers: { 'blitzapi.people.email.reverse': blitzHit } });
  const { svc, monid } = mk({ treg });
  const r = await svc.lookup({ email: 'jane@acme.com', name: 'Peter Miller' });
  assert.equal(r.status, 'uncertain'); assert.equal(r.match.nameMatched, false); assert.equal(r.match.confidence, 'weak'); assert.equal(r.match.step, 'blitzapi');
  assert.ok(monid.calls.some(c => c.provider === 'hunterio'), 'hunter was still tried after the mismatch');
  const monid2 = fakeMonid({ answers: { 'hunterio/people/find': { output: { data: { name: { fullName: 'Peter Miller' }, employment: { title: 'CEO', name: 'Acme' }, linkedin: { handle: 'petermiller' } } } } } });
  const r2 = await mk({ treg: fakeTreg({ answers: { 'blitzapi.people.email.reverse': blitzHit } }), monid: monid2 }).svc.lookup({ email: 'jane@acme.com', name: 'Peter Miller' });
  assert.equal(r2.status, 'found'); assert.equal(r2.match.step, 'hunter'); assert.equal(r2.profile.linkedinUrl, 'https://www.linkedin.com/in/petermiller');
  assert.equal(r2.cost.usd, 0.0005 + 0.0049);
});

test('free-mail and role addresses are skipped without paid calls unless forced', async () => {
  const treg = fakeTreg({ answers: { 'blitzapi.people.email.reverse': blitzHit } });
  const { svc } = mk({ treg });
  const a = await svc.lookup({ email: 'someone@gmail.com' });
  assert.equal(a.status, 'skipped'); assert.equal(a.skippedReason, 'free_mail_provider'); assert.equal(treg.calls.length, 0);
  const b = await svc.lookup({ email: 'info@acme.com' });
  assert.equal(b.status, 'skipped'); assert.equal(b.skippedReason, 'role_address');
  const c = await svc.lookup({ email: 'someone@gmail.com', force: true });
  assert.equal(c.status, 'found'); assert.equal(treg.calls.length, 1);
});

test('per-lookup and daily budgets skip expensive steps; step errors do not abort', async () => {
  const monid = fakeMonid({ answers: { 'hunterio/people/find': Object.assign(new Error('MONID_UNAVAILABLE'), { code: 'MONID_UNAVAILABLE', billing: 'none', usd: 0 }) }, prices: { 'apollo/people/match': 0.026 } });
  const { svc } = mk({ monid, config: { lookupMaxUsd: 0.01 } });
  const r = await svc.lookup({ email: 'jane@acme.com' });
  const by = Object.fromEntries(r.cost.calls.map(c => [c.step, c]));
  assert.equal(by.hunter.status, 'error'); assert.equal(by.apollo.status, 'skipped'); assert.equal(by.apollo.reason, 'lookup_budget'); assert.equal(by.datalegion.reason, 'lookup_budget');
  const { svc: svc2, treg } = mk({ config: { dailyCapUsd: 0 } });
  const r2 = await svc2.lookup({ email: 'jane@acme.com' });
  assert.equal(r2.status, 'not_found'); assert.ok(r2.cost.calls.every(c => c.status === 'skipped' && c.reason === 'daily_budget')); assert.equal(treg.calls.length, 0);
});

test('unconfigured providers are skipped and reported', async () => {
  const { svc } = mk({ monid: notConfigured(), firecrawl: notConfigured() });
  const r = await svc.lookup({ email: 'jane@acme.com' });
  assert.equal(r.cost.calls.find(c => c.step === 'hunter').reason, 'not_configured');
  assert.equal(svc.steps().find(s => s.id === 'hunter').enabled, false);
});

test('invalid email is rejected', async () => {
  const { svc } = mk();
  await assert.rejects(svc.lookup({ email: 'nope' }), e => e.code === 'INVALID_EMAIL');
});

test('quickenrich answer shape (employee_linkedin) is mapped to a profile', async () => {
  const treg = fakeTreg({ answers: { 'quickenrich.people.enrich': { data: { success: true, code: 200, data: { first_name: 'Jane', last_name: 'Doe', title: 'CTO', employee_linkedin: 'https://www.linkedin.com/in/janedoe', company_name: 'Acme', company_url: 'acme.com', company_linked: 'https://www.linkedin.com/company/acme', city: 'Berlin', country_code: 'DE', employee_phone: '+49…' } } } }, prices: { 'quickenrich.people.enrich': 0.004834 } });
  const { svc } = mk({ treg });
  const r = await svc.lookup({ email: 'jane@acme.com' });
  assert.equal(r.status, 'found'); assert.equal(r.profile.linkedinUrl, 'https://www.linkedin.com/in/janedoe'); assert.equal(r.profile.company, 'Acme'); assert.equal(r.match.step, 'quickenrich');
  assert.equal(JSON.stringify(r.profile).includes('+49'), false); // phone never leaves the adapter
  const miss = fakeTreg({ answers: { 'quickenrich.people.enrich': { usd: 0, data: { success: false, message: 'not found', code: 404, data: null } } } });
  const r2 = await mk({ treg: miss }).svc.lookup({ email: 'nobody@acme.com' });
  assert.equal(r2.cost.calls.find(c => c.step === 'quickenrich').status, 'miss');
});

// ── websearch: name + company on linkedin.com, the step that works for addresses no vendor knows (seen live 2026-10-25) ──
const liveWeb = [
  { url: 'https://www.linkedin.com/in/zongrong-jasper-li-61457b287', title: 'Zongrong(Jasper) Li - Head of Growth at Monid.ai - LinkedIn', description: 'Li Head of Growth at Monid.ai. Im the Head of Growth at Monid, the OpenRouter for agent tools.' },
  { url: 'https://www.linkedin.com/posts/zongrong-jasper-li-61457b287_im-happy-activity-7517328265355673600-HyI7', title: 'Zongrong(Jasper) Li posted this - LinkedIn', description: 'starting a new position as Head of Growth at Monid!' },
];
test('websearch runs after the reverse-email misses and finds the person by name + company', async () => {
  const firecrawl = fakeFirecrawl({ answers: { search: { web: liveWeb, credits: 2 } } });
  const { svc } = mk({ firecrawl });
  const r = await svc.lookup({ email: 'zongrong@monid.ai', name: 'Zongrong Li' });
  assert.equal(r.status, 'found'); assert.equal(r.match.step, 'websearch'); assert.equal(r.match.nameMatched, true);
  assert.equal(r.profile.linkedinUrl, 'https://www.linkedin.com/in/zongrong-jasper-li-61457b287');
  assert.equal(r.profile.fullName, 'Zongrong(Jasper) Li'); assert.equal(r.profile.title, 'Head of Growth'); assert.equal(r.profile.company, 'Monid.ai'); assert.equal(r.profile.companyDomain, 'monid.ai');
  const q = firecrawl.calls.find(c => c.capability === 'search');
  assert.equal(q.options.query, '"Zongrong Li" monid'); assert.deepEqual(q.options.includeDomains, ['linkedin.com']); assert.equal(q.maxCredits, 2);
  assert.deepEqual(r.cost.calls.map(c => c.step), ['blitzapi', 'hunter', 'quickenrich', 'apollo', 'websearch']);
  assert.equal(r.cost.calls.at(-1).usd, 0.0064);
});
test('websearch: a result with another name or without the company is a miss, and it is skipped without a header name', async () => {
  const firecrawl = fakeFirecrawl({ answers: { search: { web: [{ url: 'https://www.linkedin.com/in/other-li', title: 'Wei Li - CTO at Monid - LinkedIn', description: '' }, { url: 'https://www.linkedin.com/in/zongrong-li-9', title: 'Zongrong Li - Analyst at Bank - LinkedIn', description: 'finance' }] } } });
  const { svc } = mk({ firecrawl });
  const r = await svc.lookup({ email: 'zongrong@monid.ai', name: 'Zongrong Li' });
  assert.equal(r.status, 'not_found'); assert.equal(r.cost.calls.find(c => c.step === 'websearch').status, 'miss');
  const r2 = await svc.lookup({ email: 'someone@monid.ai' });
  const ws = r2.cost.calls.find(c => c.step === 'websearch');
  assert.equal(ws.status, 'skipped'); assert.equal(ws.reason, 'missing_input');
  assert.equal(firecrawl.calls.filter(c => c.capability === 'search').length, 1);
});
