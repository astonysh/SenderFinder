// Anonymous usage statistics. ON by default; one switch in the options page turns it off and deletes the id.
//
// What is counted: per calendar day, how many lookups ran and how they ended, which steps were called and
// how often they hit, which mail client the lookup came from, and the rounded total spend. What is NOT
// counted, ever: email addresses, names, domains, LinkedIn URLs, profile fields, API keys, message content.
//
// The functions here are pure so they can be unit-tested; background.js owns storage and the network.

export const TELEMETRY_VERSION = 1;
// Where the daily summary is posted. The receiving code is in telemetry/worker.js (open source, same repo).
export const TELEMETRY_ENDPOINT = 'https://telemetry.senderfinder.com/v1/daily';
export const MAX_PENDING_DAYS = 14;              // unsent days older than this are dropped, not retried forever
export const SOURCES = ['gmail', 'outlook', 'options', 'popup', 'other'];
export const STATUSES = ['found', 'uncertain', 'not_found', 'skipped'];

export const emptyDay = () => ({ lookups: 0, found: 0, uncertain: 0, not_found: 0, skipped: 0, cached: 0, usd: 0, steps: {}, sources: {} });

const round4 = n => Math.round((Number(n) || 0) * 10000) / 10000;

// Fold one lookup result into a day's counters. Returns a new object; never mutates.
export function bump(day, result, source) {
  const d = day ? { ...day, steps: { ...day.steps }, sources: { ...day.sources } } : emptyDay();
  if (!result || result.ok === false) return d;            // errors (no keys, forbidden, provider failure) are not counted
  d.lookups += 1;
  if (STATUSES.includes(result.status)) d[result.status] += 1;
  if (result.cached) { d.cached += 1; return d; }         // a cache hit cost nothing and called nobody
  const src = SOURCES.includes(source) ? source : 'other';
  d.sources[src] = (d.sources[src] || 0) + 1;
  d.usd = round4(d.usd + ((result.cost && result.cost.usd) || 0));
  for (const c of (result.cost && result.cost.calls) || []) {
    if (!c || typeof c.step !== 'string' || c.status === 'skipped') continue;   // skipped = not configured / over budget; nothing was called
    const s = d.steps[c.step] || { calls: 0, hits: 0, errors: 0 };
    s.calls += 1;
    if (c.status === 'hit') s.hits += 1;
    if (c.status === 'error') s.errors += 1;
    d.steps[c.step] = s;
  }
  return d;
}

// The exact document that is sent for one day. Keep this in sync with the options page preview and privacy.html.
export function buildPayload({ day, counters, installId, version, lang }) {
  const c = counters || emptyDay();
  return {
    v: TELEMETRY_VERSION,
    install: installId,                                   // random id, created on first count; deleted when the user switches off
    day,                                                  // local calendar day, YYYY-MM-DD
    version: String(version || ''),                       // extension version
    lang: String(lang || '').slice(0, 10),                // UI language, e.g. "zh-CN"
    lookups: c.lookups, found: c.found, uncertain: c.uncertain, not_found: c.not_found, skipped: c.skipped, cached: c.cached,
    usd: round4(c.usd),
    steps: c.steps,                                       // { blitzapi: { calls, hits, errors }, ... }
    sources: c.sources,                                   // { gmail: n, outlook: n, ... }
  };
}

// Days that are complete (strictly before `today`) and still within the retry window.
export function pendingDays(days, today) {
  const cutoff = new Date(Date.parse(today + 'T00:00:00Z') - MAX_PENDING_DAYS * 86400000).toISOString().slice(0, 10);
  return Object.keys(days || {}).filter(d => d < today && d >= cutoff).sort();
}
export function staleDays(days, today) {
  const cutoff = new Date(Date.parse(today + 'T00:00:00Z') - MAX_PENDING_DAYS * 86400000).toISOString().slice(0, 10);
  return Object.keys(days || {}).filter(d => d < cutoff);
}

export const newInstallId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join(''));
