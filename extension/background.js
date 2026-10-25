// Service worker: the only place that holds the provider keys and runs the waterfall.
// Content scripts send messages; they never see keys or raw provider payloads.
import { getSettings, setSettings, publicSettings, buildService, describeSteps, hasAnyKey, normalizeSettings } from './lib/settings.js';
import { dayOf } from './core/store.js';
import { normalizeEmail, cleanDisplayName, domainOf, isFreeMail, isRoleAddress, normalizeLinkedInUrl } from './core/identity.js';
import { guessTimeZone } from './core/geo.js';
import { composeNote } from './core/connect.js';
import { slugOf, parseNetworkInfo, parseDashProfile, relationOf } from './core/lirel.js';
import { extractLinkedInUrls, signatureBlock } from './core/signature.js';
import { STEPS } from './core/waterfall.js';
import { t } from './lib/i18n.js';
import { bump, buildPayload, pendingDays, staleDays, newInstallId, TELEMETRY_ENDPOINT } from './core/telemetry.js';

let svc = null;
async function service() {
  if (svc) return svc;
  const settings = await getSettings();
  svc = { settings, ...buildService(settings) };
  return svc;
}
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local' || !ch.settings) return;
  svc = null;
  // Keys just appeared: results that said "no key set" are stale now. Drop them from every open panel and re-run the
  // automatic lookup for the person the tab is about, so the side panel does not keep showing the old error.
  const had = hasAnyKey(normalizeSettings(ch.settings.oldValue)), has = hasAnyKey(normalizeSettings(ch.settings.newValue));
  if (!had && has) retryNoKeyPanels().catch(e => console.warn('[senderfinder] retry after keys', e && e.message));
});
async function retryNoKeyPanels() {
  const all = await chrome.storage.session.get(null);
  for (const [k, st] of Object.entries(all)) {
    if (!k.startsWith('panel:') || !st || !st.results) continue;
    const tabId = Number(k.slice(6));
    const stale = Object.entries(st.results).filter(([, r]) => r && r.ok === false && r.error === 'NO_KEYS').map(([e]) => e);
    if (!stale.length) continue;
    for (const e of stale) delete st.results[e];
    st.updatedAt = Date.now();
    await setPanel(tabId, st);
    await pushPanel(tabId);
    const email = st.subject && st.subject.email;
    if (st.auto && email && stale.includes(email)) {
      st.results[email] = { pending: true }; await pushPanel(tabId);
      const r = withTz(await doLookup({ email, name: st.subject.name, signature: st.signatures && st.signatures[email], auto: true, source: st.source }));
      await telemetryCount(r, st.source);
      if (await stillCurrent(tabId, st)) { st.results[email] = r; await pushPanel(tabId); }
    }
  }
}

// ── Keep the worker alive while a lookup is in flight (Monid polling can take ~45 s). ──
let busy = 0, keepalive = null;
function hold() { busy++; if (!keepalive) keepalive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000); }
function release() { busy = Math.max(0, busy - 1); if (!busy && keepalive) { clearInterval(keepalive); keepalive = null; } }

// ── Lookups run one at a time so the budget checks are sequential. ──
let queue = Promise.resolve();
const inflight = new Map(); // email -> promise
function enqueue(fn) { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; }

// ── Automatic lookups per day (user's own protection against a noisy inbox). ──
async function autoAllowed(limit) {
  const day = dayOf(new Date());
  const { autoCount } = await chrome.storage.local.get('autoCount');
  const n = autoCount && autoCount.day === day ? autoCount.n : 0;
  return { allowed: n < limit, n, day };
}
async function autoBump() {
  const day = dayOf(new Date());
  const { autoCount } = await chrome.storage.local.get('autoCount');
  const n = autoCount && autoCount.day === day ? autoCount.n : 0;
  await chrome.storage.local.set({ autoCount: { day, n: n + 1 } });
}

const fromMailPage = sender => /^https:\/\/(mail\.google\.com|outlook\.(live|office|office365)\.com)\//.test((sender && sender.tab && sender.tab.url) || (sender && sender.url) || '');
const fromExtensionPage = sender => !!(sender && sender.id === chrome.runtime.id && typeof sender.url === 'string' && sender.url.startsWith('chrome-extension://' + chrome.runtime.id + '/'));
const err = (code, message, extra = {}) => ({ ok: false, error: code, message, ...extra });

// Cache entries written before time zones existed get one on the way out (guessed from the location).
const withTz = r => { if (r && r.profile && !r.profile.timeZone && r.profile.location) r.profile.timeZone = guessTimeZone(r.profile.location); return r; };

// ── "Connect on LinkedIn": the extension opens the profile in a tab it owns and, once the page has loaded,
//    injects content/linkedin.js, which clicks Connect → Add a note and prefills the note. The user presses Send.
//    linkedin.com is an optional host permission, requested from connect.html on first use. Jobs live in
//    chrome.storage.session (keyed by tab id) so a service-worker restart between tab creation and page load is harmless.
const LI_ORIGIN = 'https://www.linkedin.com/*';
const isLinkedInTab = url => /^https:\/\/www\.linkedin\.com\//.test(url || '');
const sess = { get: async k => (await chrome.storage.session.get(k))[k] || null, set: (k, v) => chrome.storage.session.set({ [k]: v }), del: k => chrome.storage.session.remove(k) };
async function connectJobFrom(msg) {
  const url = normalizeLinkedInUrl(msg.linkedinUrl);
  if (!url || !/^https:\/\/www\.linkedin\.com\/in\//.test(url)) return null;
  const settings = await getSettings();
  const name = typeof msg.fullName === 'string' ? msg.fullName.trim().slice(0, 120) : '';
  const company = typeof msg.company === 'string' ? msg.company.trim().slice(0, 120) : '';
  const note = composeNote({ template: settings.connectNote || t('connect_note_default'), vars: { name, company }, signature: settings.connectSignature ? t('connect_signature') : '' });
  return { linkedinUrl: url, name, company, note, createdAt: Date.now() };
}
async function openConnectTab(job) {
  const tab = await chrome.tabs.create({ url: job.linkedinUrl, active: true });
  await sess.set('connect:' + tab.id, job);
  return { ok: true, tabId: tab.id };
}
async function connectStart(msg) {
  const job = await connectJobFrom(msg);
  if (!job) return err('BAD_URL', t('err_generic'));
  // The relationship may change now (invitation sent): drop the cached one so the side panel checks LinkedIn again.
  const sl = slugOf(job.linkedinUrl); if (sl) await chrome.storage.local.remove('lirel:' + sl.toLowerCase());
  if (await chrome.permissions.contains({ origins: [LI_ORIGIN] })) return openConnectTab(job);
  await sess.set('connect:pending', job);
  await chrome.tabs.create({ url: chrome.runtime.getURL('connect.html'), active: true });
  return { ok: true, needsPermission: true };
}
// Options page preview of the note, with a sample person. (Module level: inside the message handler `t` is the message type.)
async function connectPreview(msg) {
  const s = await getSettings();
  const template = typeof msg.template === 'string' ? msg.template : (s.connectNote || t('connect_note_default'));
  const note = composeNote({ template, vars: { name: 'Rahul Vohra', company: 'Rapportive' }, signature: (msg.signature == null ? s.connectSignature : msg.signature === true) ? t('connect_signature') : '' });
  return { ok: true, note, defaultTemplate: t('connect_note_default'), signature: t('connect_signature') };
}
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete') return;
  const job = await sess.get('connect:' + tabId);
  if (!job || !isLinkedInTab(tab && tab.url)) return;
  if (Date.now() - job.createdAt > 10 * 60 * 1000) { await sess.del('connect:' + tabId); return; }
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content/linkedin.js'] }); }
  catch (e) { console.warn('[senderfinder] connect: inject failed', e && e.message); }
});
chrome.tabs.onRemoved.addListener(tabId => { sess.del('connect:' + tabId).catch(() => {}); sess.del('connect:sent:' + tabId).catch(() => {}); });

// ── Relationship + photo from LinkedIn (optional): the signed-in user's degree to a profile, whether an invitation
//    is pending, and the profile photo. Read with the user's own linkedin.com session (csrf header = JSESSIONID),
//    only for people shown in the side panel, one at a time, cached for 3 days and capped per day so the account
//    never sees bulk traffic. Needs the optional linkedin.com origin + "cookies" permissions.
const LI_REL_PERMS = { permissions: ['cookies'], origins: [LI_ORIGIN] };
const LI_REL_TTL_MS = 3 * 24 * 3600 * 1000, LI_REL_OPEN_TTL_MS = 12 * 3600 * 1000, LI_REL_DAILY = 60, LI_INVITE_TTL_MS = 30 * 24 * 3600 * 1000;
const DECO = 'com.linkedin.voyager.dash.deco.identity.profile.';
const DASH_DECOS = [DECO + 'FullProfileWithEntities-93', DECO + 'FullProfileWithEntities-91', DECO + 'WebTopCardCore-18', null];
// Decorations that carry the member relationship (degree / connected / invitation), tried when the profile one lacks it.
const REL_DECOS = [DECO + 'TopCardSupplementary-150', DECO + 'TopCardSupplementary-140', DECO + 'TopCardSupplementary-130', DECO + 'WebTopCardCore-20', DECO + 'WebTopCardCore-16', DECO + 'TopCardComplete-138'];
const LI_REL_VERSION = 5;   // cache entries from an older parser are fetched again once (5: "*connection" URN links)
let liChain = Promise.resolve();
const liSerial = fn => { const p = liChain.then(fn, fn); liChain = p.then(() => new Promise(r => setTimeout(r, 800)), () => {}); return p; };
async function liFetch(path, csrf, { normalized = true } = {}) {
  const headers = { 'csrf-token': csrf, 'x-restli-protocol-version': '2.0.0' };
  if (normalized) headers.accept = 'application/vnd.linkedin.normalized+json+2.1';
  const r = await fetch('https://www.linkedin.com/voyager/api/' + path, { credentials: 'include', headers });
  if (r.status === 401) throw Object.assign(new Error('signed out'), { code: 'LI_SIGNED_OUT' });
  if (r.status === 429 || r.status === 999) throw Object.assign(new Error('rate limited'), { code: 'LI_RATE_LIMIT' });
  return { status: r.status, json: r.ok ? await r.json().catch(() => null) : null };
}
// Tries decorations in order (the last one that worked first) and returns the first parsed result that `good` accepts.
async function liDash(slug, csrf, decos, memoKey, good, diag) {
  const memo = (await chrome.storage.local.get(memoKey))[memoKey];
  const order = memo !== undefined && decos.includes(memo) ? [memo, ...decos.filter(d => d !== memo)] : decos;
  for (const d of order) {
    const { status, json } = await liFetch(`identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(slug)}` + (d ? '&decorationId=' + d : ''), csrf);
    const parsed = parseDashProfile(json, slug);
    diag.push({ deco: d ? d.slice(DECO.length) : null, status, found: parsed.found, photo: !!parsed.photoUrl, keys: parsed.diag });
    // No such profile (the link from the provider is wrong): other decorations will not change that.
    if (status === 404 || status === 403) return { missing: true };
    if (json && good(parsed)) { if (d !== memo) await chrome.storage.local.set({ [memoKey]: d }); return parsed; }
  }
  return null;
}
async function liInvitedRecently(slug) {
  const k = 'liInvited:' + slug.toLowerCase(); const at = (await chrome.storage.local.get(k))[k];
  return !!at && Date.now() - at < LI_INVITE_TTL_MS;
}
async function liRelation(msg) {
  const slug = slugOf(normalizeLinkedInUrl(msg.linkedinUrl));
  if (!slug) return err('BAD_URL');
  if (!(await chrome.permissions.contains(LI_REL_PERMS))) return err('LI_NO_PERMISSION');
  const key = 'lirel:' + slug.toLowerCase();
  const cached = (await chrome.storage.local.get(key))[key];
  const finish = async ({ diag, ...rel }) => { const pending = rel.pending || (rel.relation !== 'connected' && await liInvitedRecently(slug)); return { ok: true, ...rel, pending, relation: relationOf({ ...rel, pending }) }; };
  // Not-yet-connected people can change state (invited, accepted) at any time: re-check them sooner.
  const ttl = cached && relationOf(cached) === 'connected' ? LI_REL_TTL_MS : LI_REL_OPEN_TTL_MS;
  if (cached && cached.v === LI_REL_VERSION && msg.force !== true && Date.now() - cached.at < ttl) return finish({ ...cached, cached: true });
  return liSerial(async () => {
    const day = dayOf(new Date());
    const { lirelCount } = await chrome.storage.local.get('lirelCount');
    const n = lirelCount && lirelCount.day === day ? lirelCount.n : 0;
    if (n >= LI_REL_DAILY) return cached ? finish({ ...cached, cached: true }) : err('LI_DAILY_LIMIT');
    const c = await chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'JSESSIONID' });
    if (!c || !c.value) return err('LI_SIGNED_OUT');
    const csrf = c.value.replace(/"/g, '');
    try {
      await chrome.storage.local.set({ lirelCount: { day, n: n + 1 } });
      const diag = [];
      // networkinfo answers 410 since autumn 2026 (retired): the degree then comes from the profile decorations below.
      let ni = await liFetch(`identity/profiles/${encodeURIComponent(slug)}/networkinfo`, csrf);
      if (!ni.json && ni.status !== 410) ni = await liFetch(`identity/profiles/${encodeURIComponent(slug)}/networkinfo`, csrf, { normalized: false });
      const net = parseNetworkInfo(ni.json);
      diag.push({ networkinfo: ni.status, distance: net.distance });
      // The profile decoration (photo) and the one carrying the relationship change version now and then:
      // remember the ones that work. Relationship decorations are only tried when nothing else gave a degree.
      const dash = (await liDash(slug, csrf, DASH_DECOS, 'lirelDeco', x => x.photoUrl || x.found, diag)) || {};
      if (dash.missing) { const rel = { v: LI_REL_VERSION, missing: true, at: Date.now(), diag }; await chrome.storage.local.set({ [key]: rel }); return finish(rel); }
      let relD = dash.found ? dash : null;
      if (!relD && net.distance == null) relD = await liDash(slug, csrf, REL_DECOS, 'lirelRelDeco', x => x.found, diag);
      const rel = { v: LI_REL_VERSION, distance: net.distance != null ? net.distance : (relD && relD.distance) || null, connected: relD ? relD.connected : null, pending: relD ? relD.pending : null,
        photoUrl: dash.photoUrl || (relD && relD.photoUrl) || null, companies: { ...((relD && relD.companies) || {}), ...(dash.companies || {}) }, at: Date.now(), diag };
      await chrome.storage.local.set({ [key]: rel });
      return finish(rel);
    } catch (e) {
      if (cached) return finish({ ...cached, cached: true, stale: true });
      return err(e.code || 'LI_FAILED', String(e && e.message || e));
    }
  });
}

const summary = r => r && ({ email: r.email, status: r.status, cached: true, profile: r.profile, match: r.match, cost: r.cost, skippedReason: r.skippedReason, lookedUpAt: r.lookedUpAt, ok: true });

// ── Side panel state: who the open mail tab is about. One entry per tab, cached in memory and mirrored in
//    chrome.storage.session so a service-worker restart does not lose it; pushed to the panel and to the tab whenever
//    it changes. Signatures stay here and never reach the panel.
const panels = new Map(); // tabId -> { gen, source, subject, auto, reason, participants, signatures, results, updatedAt }
const publicPanel = st => (st ? { source: st.source, subject: st.subject, auto: st.auto, reason: st.reason, participants: st.participants, results: st.results, updatedAt: st.updatedAt } : { empty: true });
async function getPanel(tabId) {
  if (panels.has(tabId)) return panels.get(tabId);
  const st = await sess.get('panel:' + tabId);
  if (st) panels.set(tabId, st);
  return st;
}
async function setPanel(tabId, st) { if (st) { panels.set(tabId, st); await sess.set('panel:' + tabId, st); } else { panels.delete(tabId); await sess.del('panel:' + tabId); } }
async function pushPanel(tabId) {
  const st = await getPanel(tabId);
  if (st) await sess.set('panel:' + tabId, st);
  const msg = { type: 'panel:state', tabId, state: publicPanel(st) };
  chrome.runtime.sendMessage(msg).catch(() => {});
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}
const stillCurrent = async (tabId, st) => { const cur = await getPanel(tabId); return !!cur && cur.gen === st.gen; };
const cleanName = v => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
async function cachedFor(store, email) { const c = await store.getLookup(email); return c && c.status !== 'skipped' ? withTz(summary(c)) : null; }
async function threadUpdate(tabId, msg) {
  const email = msg.subject && normalizeEmail(msg.subject.email);
  if (!email) return err('INVALID_EMAIL', t('err_invalid_email'));
  const subject = { email, name: cleanName(msg.subject.name) };
  const participants = (Array.isArray(msg.participants) ? msg.participants : []).map(p => p && ({ email: normalizeEmail(p.email), name: cleanName(p.name) })).filter(p => p && p.email && p.email !== email).slice(0, 20);
  const signatures = {};
  if (msg.signatures && typeof msg.signatures === 'object') for (const [k, v] of Object.entries(msg.signatures).slice(0, 25)) { const e = normalizeEmail(k); if (e && typeof v === 'string') signatures[e] = v.slice(0, 20000); }
  const st = { gen: Date.now() + Math.random(), source: msg.source === 'outlook' ? 'outlook' : 'gmail', subject, auto: msg.auto === true, reason: typeof msg.reason === 'string' ? msg.reason.slice(0, 20) : null, participants, signatures, results: {}, updatedAt: Date.now() };
  await setPanel(tabId, st);
  const { store } = await service();
  for (const p of [subject, ...participants]) { const c = await cachedFor(store, p.email); if (c) st.results[p.email] = c; }   // cached answers first, for everyone
  await pushPanel(tabId);
  if (st.auto && !st.results[email]) {
    st.results[email] = { pending: true }; await pushPanel(tabId);
    const r = withTz(await doLookup({ email, name: subject.name, signature: st.signatures[email], auto: true, source: st.source }));
    await telemetryCount(r, st.source);
    if (await stillCurrent(tabId, st)) { st.results[email] = r; await pushPanel(tabId); }
  }
  return { ok: true };
}
// A chip was clicked: that person becomes the subject (cached result only, nothing is spent) and the panel opens.
async function panelFocus(tabId, msg) {
  const email = normalizeEmail(msg.email);
  const st = await getPanel(tabId);
  if (st && email && email !== st.subject.email) {
    st.participants = [st.subject, ...st.participants].filter(p => p.email !== email).slice(0, 20);
    st.subject = { email, name: cleanName(msg.name) }; st.auto = false; st.reason = 'manual'; st.updatedAt = Date.now();
    if (!st.results[email]) { const { store } = await service(); const c = await cachedFor(store, email); if (c) st.results[email] = c; }
    await pushPanel(tabId);
  }
  let opened = false;
  try { if (chrome.sidePanel && chrome.sidePanel.open) { await chrome.sidePanel.open({ tabId }); opened = true; } }
  catch (e) { console.warn('[senderfinder] side panel open failed:', e && e.message); }
  return { ok: true, opened };
}
async function panelLookup(tabId, msg) {
  const st = await getPanel(tabId);
  if (!st) return err('NO_THREAD');
  const email = normalizeEmail(msg.email);
  if (!email) return err('INVALID_EMAIL', t('err_invalid_email'));
  st.results = { ...st.results, [email]: { pending: true } }; await pushPanel(tabId);
  const r = withTz(await doLookup({ email, name: cleanName(msg.name), signature: st.signatures[email], force: msg.force === true, auto: false, source: st.source }));
  await telemetryCount(r, st.source);
  if (await stillCurrent(tabId, st)) { st.results = { ...st.results, [email]: r }; await pushPanel(tabId); }
  return r;
}
// The panel asked about a tab we know nothing about (worker restarted, or the panel opened late): ask the page to resend.
async function panelGet(tabId) {
  const st = await getPanel(tabId);
  if (!st && tabId >= 0) chrome.tabs.sendMessage(tabId, { type: 'thread:resend' }).catch(() => {});
  return { ok: true, state: publicPanel(st) };
}
chrome.tabs.onRemoved.addListener(tabId => { setPanel(tabId, null).catch(() => {}); });
chrome.tabs.onUpdated.addListener(async (tabId, info) => { if (info.status === 'loading' && (await getPanel(tabId))) { await setPanel(tabId, null); await pushPanel(tabId); } });
// After an install or update the mail tabs that are already open have no (working) content script: inject it.
const MAIL_SCRIPTS = [{ match: /^https:\/\/mail\.google\.com\//, files: ['content/chip.js', 'content/gmail.js'] }, { match: /^https:\/\/outlook\.(live|office|office365)\.com\//, files: ['content/chip.js', 'content/outlook.js'] }];
async function injectIntoOpenMailTabs() {
  let tabs = []; try { tabs = await chrome.tabs.query({ url: ['https://mail.google.com/*', 'https://outlook.live.com/*', 'https://outlook.office.com/*', 'https://outlook.office365.com/*'] }); } catch (_) { return; }
  for (const tab of tabs) {
    const m = MAIL_SCRIPTS.find(x => x.match.test(tab.url || ''));
    if (!m || tab.id == null) continue;
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: false }, files: m.files }); } catch (e) { console.warn('[senderfinder] inject into open tab failed', tab.id, e && e.message); }
  }
}
// The toolbar icon opens the side panel (the action has no popup any more).
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function doLookup(msg, sender) {
  const email = normalizeEmail(msg.email);
  if (!email) return err('INVALID_EMAIL', t('err_invalid_email'));
  const { settings, service: lookup, store } = await service();
  if (!hasAnyKey(settings)) {
    // No keys: the cache still answers and the free signature scan still runs, but a miss is not cached
    // (it would otherwise shadow the real lookup once keys are added).
    const cached = await store.getLookup(email);
    if (cached && cached.status !== 'skipped' && !msg.force) return { ...cached, ok: true, cached: true };
    const sig = typeof msg.signature === 'string' ? msg.signature.slice(0, 20000) : '';
    const url = sig ? (extractLinkedInUrls(signatureBlock(sig))[0] || extractLinkedInUrls(sig)[0] || null) : null;
    if (!url) {
      const skippedReason = !msg.force && settings.skipFreeMail && isFreeMail(email) ? 'free_mail_provider' : !msg.force && isRoleAddress(email) ? 'role_address' : null;
      if (skippedReason) return { ok: true, email, status: 'skipped', skippedReason, profile: null, match: null, cost: { usd: 0, calls: [] }, cached: false, lookedUpAt: new Date().toISOString() };
      return err('NO_KEYS', t('err_no_keys'));
    }
    const name = cleanDisplayName(msg.name, email);
    const rec = { email, status: 'found', nameGiven: name, source: msg.source || 'extension', skippedReason: null, lookedUpAt: new Date().toISOString(),
      profile: { linkedinUrl: url, fullName: name, headline: null, title: null, company: null, companyDomain: isFreeMail(email) ? null : domainOf(email), location: null, positions: [], provider: 'local' },
      match: { provider: 'local', step: 'signature', nameGiven: name, nameMatched: name ? true : null, confidence: 'exact' },
      cost: { usd: 0, calls: [{ step: 'signature', provider: 'local', status: 'hit', usd: 0, ms: 0 }] } };
    await store.saveLookup(rec);
    return { ok: true, ...rec, cached: false };
  }
  const auto = msg.auto === true;
  if (auto) {
    const cached = await store.getLookup(email);
    if (!cached || cached.status === 'skipped') {
      const a = await autoAllowed(settings.autoDailyLimit);
      if (!a.allowed) return err('AUTO_LIMIT', t('err_auto_limit', settings.autoDailyLimit), { n: a.n });
    }
  }
  const key = email + (msg.force ? '!' : '');
  if (!msg.force && inflight.has(key)) return inflight.get(key);
  const p = enqueue(async () => {
    hold();
    try {
      const r = await lookup.lookup({ email, name: msg.name ? String(msg.name).slice(0, 200) : undefined, signature: msg.signature ? String(msg.signature).slice(0, 20000) : undefined,
        source: ['gmail', 'outlook', 'options', 'popup'].includes(msg.source) ? msg.source : 'extension', force: msg.force === true, maxUsd: msg.maxUsd });
      if (auto && !r.cached && r.status !== 'skipped') await autoBump();
      return r;
    } catch (e) {
      return err(e.code || 'ERROR', e.message || String(e));
    } finally { release(); }
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// Free checks of the configured keys: catalog prices (treg), inspect (Monid), a 0-credit find-tools call (Firecrawl).
async function probe() {
  const { settings, clients } = await service();
  const out = { treg: null, monid: null, firecrawl: null };
  if (settings.keys.treg) {
    out.treg = { ok: true, steps: [] };
    for (const id of settings.stepOrder.filter(i => STEPS[i].provider.startsWith('treg:'))) {
      const slug = STEPS[id].provider.slice(5);
      try { const e = await clients.treg.catalog(slug); out.treg.steps.push({ id, slug, usd: e.cost && e.cost.usd, hitRate: e.observed && e.observed.hit_rate }); }
      catch (e) { out.treg.steps.push({ id, slug, error: e.code || e.message, status: e.status }); if (e.status === 401 || e.status === 403) out.treg.ok = false; }
    }
    if (out.treg.steps.length && out.treg.steps.every(s => s.error)) out.treg.ok = false;
  }
  if (settings.keys.monid) {
    out.monid = { ok: true, steps: [] };
    for (const id of settings.stepOrder.filter(i => STEPS[i].provider.startsWith('monid:'))) {
      const [prov, ...rest] = STEPS[id].provider.slice(6).split('/'); const ep = '/' + rest.join('/');
      try { const i = await clients.monid.inspect(prov, ep); const pr = i.price || {}; const base = pr.type === 'TIERED' ? pr.default : pr; out.monid.steps.push({ id, provider: prov, endpoint: ep, usd: base && base.amount && Number(base.amount.value) }); }
      catch (e) { out.monid.steps.push({ id, provider: prov, endpoint: ep, error: e.code || e.message, status: e.status }); if (e.status === 401 || e.status === 403) out.monid.ok = false; }
    }
    if (out.monid.steps.length && out.monid.steps.every(s => s.error)) out.monid.ok = false;
  }
  if (settings.keys.firecrawl) {
    try { const r = await clients.firecrawl.call('firecrawl', 'find-tools', { providers: ['datalegion'], level: 'tools', limit: 5 }, { maxUsd: 0.01, maxCredits: 0 }); out.firecrawl = { ok: true, credits: r.credits }; }
    catch (e) { out.firecrawl = { ok: false, error: e.code || e.message, status: e.status, detail: e.detail }; }
  }
  return { ok: true, ...out };
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    if (!msg || typeof msg !== 'object') return err('BAD_MESSAGE');
    const t = msg.type;
    // ── Available to content scripts on mail pages ──
    if (t === 'open-options') { if (fromMailPage(sender) || fromExtensionPage(sender)) chrome.runtime.openOptionsPage(); return { ok: true }; }
    if (t === 'ui:settings') { const s = await getSettings(); return { ok: true, ...publicSettings(s), hasKeys: hasAnyKey(s) }; }
    if (t === 'lookup') {
      if (!fromMailPage(sender) && !fromExtensionPage(sender)) return err('FORBIDDEN');
      const r = withTz(await doLookup(msg, sender));
      await telemetryCount(r, msg.source);
      return r;
    }
    if (t === 'peek') {
      if (!fromMailPage(sender) && !fromExtensionPage(sender)) return err('FORBIDDEN');
      const { store } = await service();
      const emails = Array.isArray(msg.emails) ? msg.emails.map(normalizeEmail).filter(Boolean).slice(0, 50) : [];
      const out = {};
      for (const e of emails) { const r = await store.getLookup(e); out[e] = r && r.status !== 'skipped' ? withTz(summary(r)) : null; }
      return { ok: true, results: out };
    }
    if (t === 'connect:start') { if (!fromMailPage(sender) && !fromExtensionPage(sender)) return err('FORBIDDEN'); return connectStart(msg); }
    // ── From the mail page's content script: what the open thread is about ──
    if (t === 'thread:update' || t === 'thread:clear' || t === 'panel:open') {
      const tabId = sender && sender.tab && sender.tab.id;
      if (!fromMailPage(sender) || tabId == null) return err('FORBIDDEN');
      if (t === 'thread:clear') { await setPanel(tabId, null); await pushPanel(tabId); return { ok: true }; }
      if (t === 'thread:update') return threadUpdate(tabId, msg);
      return panelFocus(tabId, msg);
    }
    // ── From the LinkedIn tab the extension opened (content/linkedin.js) ──
    if (t === 'connect:job' || t === 'connect:done') {
      const tabId = sender && sender.tab && sender.tab.id;
      if (tabId == null || !isLinkedInTab(sender.tab.url)) return err('FORBIDDEN');
      const job = await sess.get('connect:' + tabId);
      if (t === 'connect:done') { await sess.del('connect:' + tabId); if (job) await sess.set('connect:sent:' + tabId, job.linkedinUrl); return { ok: true }; }
      return { ok: true, job: job ? { note: job.note, name: job.name } : null };
    }
    if (t === 'li:invited') {
      const tabId = sender && sender.tab && sender.tab.id;
      if (tabId == null || !isLinkedInTab(sender.tab.url)) return err('FORBIDDEN');
      const job = await sess.get('connect:' + tabId);
      const slug = slugOf((job && job.linkedinUrl) || await sess.get('connect:sent:' + tabId));
      if (!slug) return err('NOTHING_PENDING');
      await chrome.storage.local.set({ ['liInvited:' + slug.toLowerCase()]: Date.now() });
      chrome.runtime.sendMessage({ type: 'li:changed', slug }).catch(() => {});   // the side panel swaps Connect for "Pending" right away
      return { ok: true };
    }
    // ── Extension pages only (popup, options) ──
    if (!fromExtensionPage(sender)) return err('FORBIDDEN');
    if (t === 'panel:get') return panelGet(Number(msg.tabId));
    if (t === 'panel:lookup') return panelLookup(Number(msg.tabId), msg);
    if (t === 'panel:focus') return panelFocus(Number(msg.tabId), msg);
    if (t === 'settings:get') { const s = await getSettings(); return { ok: true, settings: s, steps: describeSteps(s) }; }
    if (t === 'settings:set') { const s = await setSettings(msg.patch || {}); svc = null; return { ok: true, settings: s, steps: describeSteps(s) }; }
    if (t === 'steps') { const s = await getSettings(); return { ok: true, steps: describeSteps(s) }; }
    if (t === 'probe') return probe();
    if (t === 'history:list') { const { store } = await service(); return { ok: true, ...(await store.listLookups(msg)) }; }
    if (t === 'history:delete') { const { store } = await service(); return { ok: true, removed: await store.deleteLookup(normalizeEmail(msg.email)) }; }
    if (t === 'stats') {
      const { store, settings } = await service();
      const a = await autoAllowed(settings.autoDailyLimit);
      return { ok: true, ...(await store.stats()), budget: { dailyCapUsd: settings.dailyCapUsd, spentTodayUsd: await store.spentToday(), lookupMaxUsd: settings.lookupMaxUsd, autoToday: a.n, autoDailyLimit: settings.autoDailyLimit } };
    }
    if (t === 'data:export') { const { store } = await service(); return { ok: true, data: await store.exportAll() }; }
    if (t === 'data:import') { const { store } = await service(); try { return { ok: true, ...(await store.importAll(msg.data, { replace: msg.replace === true })) }; } catch (e) { return err(e.code || 'IMPORT_FAILED', e.message); } }
    if (t === 'data:clear') { const { store } = await service(); await store.clearAll(); await chrome.storage.local.remove('autoCount'); return { ok: true }; }
    if (t === 'data:prune') { const { store } = await service(); return { ok: true, removed: await store.prune() }; }
    if (t === 'connect:pending') return { ok: true, job: await sess.get('connect:pending') };
    if (t === 'connect:cancel') { await sess.del('connect:pending'); return { ok: true }; }
    if (t === 'connect:granted') { const job = await sess.get('connect:pending'); if (!job) return err('NOTHING_PENDING'); await sess.del('connect:pending'); return openConnectTab(job); }
    if (t === 'connect:permission') return { ok: true, granted: await chrome.permissions.contains({ origins: [LI_ORIGIN] }) };
    if (t === 'connect:revoke') { const removed = await chrome.permissions.remove({ permissions: ['cookies'], origins: [LI_ORIGIN] }); return { ok: true, removed }; }
    if (t === 'connect:preview') return connectPreview(msg);
    if (t === 'li:relation') return liRelation(msg);
    if (t === 'li:permission') return { ok: true, granted: await chrome.permissions.contains(LI_REL_PERMS) };
    if (t === 'telemetry:preview') return telemetryPreview();
    if (t === 'telemetry:set') return telemetrySet(msg.enabled === true);
    return err('UNKNOWN_TYPE');
  })().then(respond, e => respond(err('INTERNAL', String(e && e.message || e))));
  return true;
});

// ── Anonymous usage statistics (on by default, one switch to turn off). Counters live in chrome.storage.local under `tele`:
//    { installId, days: { 'YYYY-MM-DD': counters } }. Completed days are posted once an hour by an alarm,
//    then deleted locally. Nothing here ever touches the email, name or profile of a lookup.
let teleLock = Promise.resolve();
const withTele = fn => (teleLock = teleLock.then(fn, fn));
async function telemetryCount(result, source) {
  const { settings } = await service();
  if (!settings.telemetry) return;
  await withTele(async () => {
    const { tele } = await chrome.storage.local.get('tele');
    const t = tele && tele.installId ? tele : { installId: newInstallId(), days: {} };
    const day = dayOf(new Date());
    t.days = { ...(t.days || {}), [day]: bump(t.days && t.days[day], result, source) };
    await chrome.storage.local.set({ tele: t });
  });
}
function telemetryMeta() { return { version: chrome.runtime.getManifest().version, lang: (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || '' }; }
async function telemetryFlush() {
  const { settings } = await service();
  if (!settings.telemetry) return { sent: 0 };
  return withTele(async () => {
    const { tele } = await chrome.storage.local.get('tele');
    if (!tele || !tele.installId || !tele.days) return { sent: 0 };
    const today = dayOf(new Date());
    for (const d of staleDays(tele.days, today)) delete tele.days[d];
    let sent = 0;
    for (const day of pendingDays(tele.days, today)) {
      const body = JSON.stringify(buildPayload({ day, counters: tele.days[day], installId: tele.installId, ...telemetryMeta() }));
      try {
        const res = await fetch(TELEMETRY_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body, credentials: 'omit', cache: 'no-store' });
        if (!res.ok && res.status !== 409) break;         // server trouble: keep the day and retry next hour
        delete tele.days[day]; sent++;
      } catch (_) { break; }                              // offline: retry next hour
    }
    await chrome.storage.local.set({ tele });
    return { sent };
  });
}
async function telemetryPreview() {
  const { settings } = await service();
  const { tele } = await chrome.storage.local.get('tele');
  const t = tele && tele.installId ? tele : { installId: '(generated on first use)', days: {} };
  const today = dayOf(new Date());
  const days = Object.keys(t.days || {}).sort().map(day => buildPayload({ day, counters: t.days[day], installId: t.installId, ...telemetryMeta() }));
  if (!days.length) days.push(buildPayload({ day: today, counters: null, installId: t.installId, ...telemetryMeta() }));
  return { ok: true, enabled: settings.telemetry, endpoint: TELEMETRY_ENDPOINT, pending: pendingDays(t.days, today), days };
}
async function telemetrySet(enabled) {
  await setSettings({ telemetry: enabled }); svc = null;
  if (enabled) { await chrome.storage.local.set({ tele: { installId: newInstallId(), days: {} } }); chrome.alarms.create('telemetry-flush', { periodInMinutes: 60, delayInMinutes: 1 }); }
  else { await chrome.storage.local.remove('tele'); chrome.alarms.clear('telemetry-flush'); }   // switching off deletes the id and anything unsent
  const s = await getSettings();
  return { ok: true, settings: s, steps: describeSteps(s) };
}
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'telemetry-flush') telemetryFlush().catch(() => {}); });
chrome.runtime.onStartup.addListener(async () => { const s = await getSettings(); if (s.telemetry) chrome.alarms.create('telemetry-flush', { periodInMinutes: 60, delayInMinutes: 2 }); });

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
  injectIntoOpenMailTabs().catch(() => {});
  const s = await getSettings();
  if (s.telemetry) chrome.alarms.create('telemetry-flush', { periodInMinutes: 60, delayInMinutes: 2 });
});
