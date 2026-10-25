'use strict';
// The lookup: cache -> free signature scan -> paid providers, cheapest first.
// Every paid call is price-checked against the remaining per-lookup budget and the
// daily cap before it is sent, and booked in the ledger after it returns.
const { normalizeEmail, domainOf, isFreeMail, isRoleAddress, cleanDisplayName, nameMatches, normalizeLinkedInUrl } = require('./identity');
const { extractLinkedInUrls, signatureBlock } = require('./signature');
const { normalizeProfile } = require('./providers/profile');

// Step catalogue. `needs` lists what must be known; `maxUsd` is the catalog price we accept.
// Observed hit rates (treg catalog, 2026-10-25): blitzapi 21 %, quickenrich 11 %, hunter 46 %.
const STEPS = {
  signature:  { id: 'signature',  provider: 'local',                                 label: '邮件签名里的 LinkedIn 链接',       maxUsd: 0,      needs: ['email'] },
  blitzapi:   { id: 'blitzapi',   provider: 'treg:blitzapi.people.email.reverse',    label: 'BlitzAPI 邮箱反查（treg）',        maxUsd: 0.001,  needs: ['email'] },
  quickenrich:{ id: 'quickenrich',provider: 'treg:quickenrich.people.enrich',        label: 'QuickEnrich 邮箱反查（treg）',     maxUsd: 0.006,  needs: ['email'] },
  hunter:     { id: 'hunter',     provider: 'monid:hunterio/people/find',            label: 'Hunter.io 邮箱反查（MonID）',       maxUsd: 0.006,  needs: ['email'] },
  village:    { id: 'village',    provider: 'treg:village.people.from_email',        label: 'Village 邮箱反查（treg）',         maxUsd: 0.025,  needs: ['email'] },
  apollo:     { id: 'apollo',     provider: 'monid:apollo/people/match',             label: 'Apollo 匹配（MonID）',             maxUsd: 0.03,   needs: ['email'] },
  datalegion: { id: 'datalegion', provider: 'firecrawl:datalegion/people/enrich-base-no-contact', label: 'Data Legion 邮箱反查（Firecrawl）', maxUsd: 0.035, needs: ['email'], credits: 10 },
  contactout: { id: 'contactout', provider: 'monid:contactout/v1/people/enrich/work-email', label: 'ContactOut 匹配（MonID）', maxUsd: 0.025, needs: ['email'] },
};

function createLookup({ store, config, monid, treg, firecrawl, now = () => new Date(), log = () => {} }) {
  const stepIds = config.steps.filter(id => STEPS[id]);

  const clientFor = id => {
    const p = STEPS[id].provider.split(':')[0];
    return p === 'local' ? { isConfigured: () => true } : p === 'treg' ? treg : p === 'monid' ? monid : p === 'firecrawl' ? firecrawl : null;
  };
  const stepEnabled = id => { const c = clientFor(id); return !!(c && c.isConfigured && c.isConfigured()); };

  function steps() { return stepIds.map(id => ({ ...STEPS[id], enabled: stepEnabled(id) })); }

  // ── Provider adapters: each returns {status:'hit'|'miss', profile, usd, billing} ──
  async function runStep(id, ctx, maxUsd) {
    const s = STEPS[id];
    if (id === 'signature') {
      const urls = extractLinkedInUrls(signatureBlock(ctx.signature || '')).concat(extractLinkedInUrls(ctx.signature || ''));
      const url = urls[0] || null;
      return url ? { status: 'hit', usd: 0, billing: 'reported', profile: { linkedinUrl: url, fullName: ctx.name || null, headline: null, title: null, company: null, companyDomain: ctx.domain, location: null, positions: [], provider: s.provider } }
        : { status: 'miss', usd: 0, billing: 'reported', profile: null };
    }
    if (id === 'blitzapi') {
      const r = await treg.call('blitzapi.people.email.reverse', { email: ctx.email }, { maxUsd });
      if (r.status === 'miss') return { ...r, profile: null };
      const d = r.data || {};
      const person = d.person || d.data || (d.found === false ? null : d);
      const profile = d.found === false || !person ? null : normalizeProfile(person, { provider: s.provider });
      return { status: profile && profile.linkedinUrl ? 'hit' : 'miss', usd: r.usd, billing: r.billing, profile: profile && profile.linkedinUrl ? profile : null };
    }
    if (id === 'quickenrich') {
      const r = await treg.call('quickenrich.people.enrich', { email: ctx.email }, { maxUsd });
      if (r.status === 'miss') return { ...r, profile: null };
      const d = r.data || {};
      const person = d.employee || d.person || d.data || d.result || (Array.isArray(d.employees) ? d.employees[0] : null) || (Array.isArray(d.results) ? d.results[0] : null) || d;
      const profile = normalizeProfile(person, { provider: s.provider });
      return { status: profile && profile.linkedinUrl ? 'hit' : 'miss', usd: r.usd, billing: r.billing, profile: profile && profile.linkedinUrl ? profile : null };
    }
    if (id === 'village') {
      const r = await treg.call('village.people.from_email', { email: ctx.email }, { maxUsd });
      if (r.status === 'miss') return { ...r, profile: null };
      const d = r.data || {};
      const profile = normalizeProfile(d.person || d.data || d, { provider: s.provider });
      return { status: profile && profile.linkedinUrl ? 'hit' : 'miss', usd: r.usd, billing: r.billing, profile: profile && profile.linkedinUrl ? profile : null };
    }
    if (id === 'hunter') {
      const r = await monid.run('hunterio', '/people/find', { queryParams: { email: ctx.email } }, { maxUsd });
      if (r.status === 'miss') return { ...r, profile: null };
      const o = r.output || {};
      const d = o.data || o;
      const emp = d.employment || {};
      const li = d.linkedin && (d.linkedin.handle || d.linkedin.url) || (d.linkedin_handle);
      const person = { full_name: d.name && (d.name.fullName || d.name.full_name) || d.full_name, first_name: d.name && (d.name.givenName || d.name.first_name), last_name: d.name && (d.name.familyName || d.name.last_name),
        title: emp.title, company_name: emp.name, company_domain: emp.domain, location: d.location || (d.geo && [d.geo.city, d.geo.country].filter(Boolean).join(', ')),
        linkedin_url: typeof li === 'string' && li ? (li.includes('linkedin.com') ? li : 'https://www.linkedin.com/in/' + li) : null };
      const profile = normalizeProfile(person, { provider: s.provider });
      return { status: profile && profile.linkedinUrl ? 'hit' : 'miss', usd: r.usd, billing: r.billing, profile: profile && profile.linkedinUrl ? profile : null };
    }
    if (id === 'apollo') {
      const qp = { email: ctx.email, ...(ctx.name ? { name: ctx.name } : {}), ...(ctx.domain ? { domain: ctx.domain } : {}) };
      const r = await monid.run('apollo', '/people/match', { queryParams: qp }, { maxUsd });
      if (r.status === 'miss') return { ...r, profile: null };
      const o = r.output || {};
      const person = o.person || (o.data && o.data.person) || null;
      // Apollo returns an empty stub for a no-match (no LinkedIn, title or organization).
      const profile = person ? normalizeProfile(person, { provider: s.provider }) : null;
      const stub = profile && !profile.linkedinUrl && !profile.title && !profile.company;
      return { status: profile && profile.linkedinUrl && !stub ? 'hit' : 'miss', usd: r.usd, billing: r.billing, profile: profile && profile.linkedinUrl && !stub ? profile : null };
    }
    if (id === 'contactout') {
      const body = { email: ctx.email, ...(ctx.name ? { full_name: ctx.name } : {}), ...(ctx.domain ? { company_domain: ctx.domain } : {}), include: ['profile'] };
      const r = await monid.run('contactout', '/v1/people/enrich/work-email', { body }, { maxUsd });
      if (r.status === 'miss') return { ...r, profile: null };
      const o = r.output || {};
      const person = o.profile || o.person || o.data || o;
      const profile = normalizeProfile(person, { provider: s.provider });
      return { status: profile && profile.linkedinUrl ? 'hit' : 'miss', usd: r.usd, billing: r.billing, profile: profile && profile.linkedinUrl ? profile : null };
    }
    if (id === 'datalegion') {
      const r = await firecrawl.call('datalegion', 'people/enrich-base-no-contact', { email: ctx.email }, { maxUsd, maxCredits: s.credits });
      if (r.status === 'miss') return { ...r, profile: null };
      const d = r.data || {};
      const m = Array.isArray(d.matches) ? d.matches[0] : null;
      const person = (m && m.person) || d.person || null;
      const profile = person ? normalizeProfile(person, { provider: s.provider }) : null;
      return { status: profile && profile.linkedinUrl ? 'hit' : 'miss', usd: r.usd, billing: r.billing, profile: profile && profile.linkedinUrl ? profile : null };
    }
    throw Object.assign(new Error('UNKNOWN_STEP'), { code: 'UNKNOWN_STEP' });
  }

  function decide(profile, ctx, stepId) {
    const matched = ctx.name && profile.fullName ? nameMatches(ctx.name, profile.fullName) : null;
    const confidence = stepId === 'signature' ? 'exact' : matched === true ? 'name' : matched === false ? 'weak' : 'exact';
    return { status: matched === false ? 'uncertain' : 'found', match: { provider: STEPS[stepId].provider, step: stepId, nameGiven: ctx.name || null, nameMatched: matched, confidence } };
  }

  // The lookup itself.
  async function lookup({ email: rawEmail, name: rawName, domain: rawDomain, signature, source = 'api', force = false, maxUsd } = {}) {
    const email = normalizeEmail(rawEmail);
    if (!email) throw Object.assign(new Error('INVALID_EMAIL'), { code: 'INVALID_EMAIL', http: 400 });
    const name = cleanDisplayName(rawName, email);
    const domain = (typeof rawDomain === 'string' && rawDomain.trim().toLowerCase().replace(/^www\./, '')) || domainOf(email);
    const ctx = { email, name, domain: isFreeMail(email) ? null : domain, signature: typeof signature === 'string' ? signature.slice(0, 200000) : '' };
    const cap = Math.min(Number.isFinite(Number(maxUsd)) && Number(maxUsd) >= 0 ? Number(maxUsd) : config.lookupMaxUsd, config.lookupMaxUsd);
    const startedAt = now();

    if (!force) {
      const cached = store.getLookup(email);
      if (cached && cached.status !== 'skipped') {
        // A cached result stays; a new header name can still refine the match verdict.
        if (cached.profile && name && cached.match && cached.match.nameGiven !== name) {
          const matched = cached.profile.fullName ? nameMatches(name, cached.profile.fullName) : null;
          cached.match = { ...cached.match, nameGiven: name, nameMatched: matched, confidence: matched === true ? 'name' : matched === false ? 'weak' : cached.match.confidence };
          cached.status = matched === false ? 'uncertain' : 'found';
          store.saveLookup({ ...cached, nameGiven: name, lookedUpAt: cached.lookedUpAt });
        }
        return { ok: true, ...cached, cached: true };
      }
    }

    const calls = [];
    let spent = 0;
    const finish = (status, profile, match, skippedReason = null) => {
      const rec = { email, status, nameGiven: name, source, profile, match, cost: { usd: round(spent), calls }, skippedReason, lookedUpAt: startedAt.toISOString() };
      store.saveLookup(rec);
      return { ok: true, ...rec, cached: false };
    };

    // Free signature scan always runs first, even for free-mail / role addresses.
    if (stepIds.includes('signature') && ctx.signature) {
      const t = Date.now();
      const r = await runStep('signature', ctx, 0);
      calls.push({ step: 'signature', provider: 'local', status: r.status, usd: 0, ms: Date.now() - t });
      store.recordCall({ email, step: 'signature', provider: 'local', status: r.status, usd: 0, ms: Date.now() - t });
      if (r.status === 'hit') { const d = decide(r.profile, ctx, 'signature'); return finish(d.status, r.profile, d.match); }
    }

    if (!force && config.skipFreeMail && isFreeMail(email)) return finish('skipped', null, null, 'free_mail_provider');
    if (!force && isRoleAddress(email)) return finish('skipped', null, null, 'role_address');

    // A provider answer whose name contradicts the header name is kept only as a fallback:
    // the cheaper providers can return the wrong person for a shared first name (seen live
    // 2026-10-25), so the next steps still run and a name-matching answer wins.
    let fallback = null;
    for (const id of stepIds) {
      if (id === 'signature') continue;
      const s = STEPS[id];
      if (!stepEnabled(id)) { calls.push({ step: id, provider: s.provider, status: 'skipped', reason: 'not_configured', usd: 0, ms: 0 }); continue; }
      const remaining = cap - spent;
      if (s.maxUsd > remaining + 1e-12) { calls.push({ step: id, provider: s.provider, status: 'skipped', reason: 'lookup_budget', usd: 0, ms: 0 }); continue; }
      const spentToday = store.spentToday();
      if (config.dailyCapUsd <= 0 || spentToday + s.maxUsd > config.dailyCapUsd + 1e-12) { calls.push({ step: id, provider: s.provider, status: 'skipped', reason: 'daily_budget', usd: 0, ms: 0 }); continue; }
      const t = Date.now();
      let r;
      try { r = await runStep(id, ctx, Math.min(s.maxUsd, remaining)); }
      catch (e) {
        const usd = Number(e.usd) || 0, billing = e.billing || 'none';
        spent += usd;
        const entry = { step: id, provider: s.provider, status: 'error', error: e.code || e.message, usd: round(usd), billing, ms: Date.now() - t };
        calls.push(entry);
        store.recordCall({ email, step: id, provider: s.provider, status: 'error', usd: billing === 'unknown' ? (e.price || 0) : usd, billing, ms: entry.ms });
        log('step error', id, e.code || e.message, e.detail || '');
        continue;
      }
      // Unknown billing: book the catalog price so the budget stays conservative.
      const booked = r.usd == null ? (r.billing === 'assumed' ? 0 : s.maxUsd) : r.usd;
      spent += booked;
      const entry = { step: id, provider: s.provider, status: r.status, usd: round(booked), billing: r.billing, ms: Date.now() - t };
      calls.push(entry);
      store.recordCall({ email, step: id, provider: s.provider, status: r.status, usd: booked, billing: r.billing, ms: entry.ms });
      if (r.status === 'hit') {
        const d = decide(r.profile, ctx, id);
        if (d.status === 'found') return finish('found', r.profile, d.match);
        if (!fallback) fallback = { profile: r.profile, match: d.match };
      }
    }
    if (fallback) return finish('uncertain', fallback.profile, fallback.match);
    return finish('not_found', null, null);
  }

  return { lookup, steps, STEPS };
}

const round = n => Math.round((Number(n) || 0) * 1e6) / 1e6;

module.exports = { createLookup, STEPS };
