// Side panel: shows the person the open email is about (Rapportive style) and the other people in the thread.
// State comes from the service worker (panel:get / panel:state); lookups are requested with panel:lookup.
import { t, localizeDocument } from './lib/i18n.js';
import { applyTheme, effectiveTheme, onThemeChange, watchTheme } from './lib/theme.js';
const $ = id => document.getElementById(id);
const send = msg => chrome.runtime.sendMessage(msg);
const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v != null) el.setAttribute(k, v); } for (const k of kids.flat()) if (k != null) el.append(k); return el; };
const usd = n => (n == null ? '—' : n === 0 ? '$0' : n < 0.01 ? '$' + Number(n).toFixed(4) : '$' + Number(n).toFixed(3));
const badge = (text, cls = '') => h('span', { class: 'badge ' + cls }, text);
const errorLabel = r => (!r ? t('err_generic') : r.error === 'NO_KEYS' ? t('err_no_keys_short') : r.error === 'AUTO_LIMIT' ? t('err_auto_limit_short') : r.error === 'UNAUTHORIZED' ? t('err_unauthorized_short') : r.error || t('err_generic'));

// The real side panel follows the active tab of its window; the test harness pins a tab with ?tabId=.
const params = new URLSearchParams(location.search);
const fixedTab = params.has('tabId') ? Number(params.get('tabId')) : null;
let tabId = fixedTab, state = { empty: true }, showCost = true, liGranted = false;

async function activeTab() {
  if (fixedTab != null) return fixedTab;
  try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab ? tab.id : null; } catch (_) { return null; }
}
async function refresh() {
  tabId = await activeTab();
  const r = tabId != null ? await send({ type: 'panel:get', tabId }).catch(() => null) : null;
  state = r && r.ok ? r.state : { empty: true };
  const lp = await send({ type: 'li:permission' }).catch(() => null);
  liGranted = !!(lp && lp.ok && lp.granted);
  render(); loadFooter();
}
if (chrome.permissions && chrome.permissions.onAdded) { chrome.permissions.onAdded.addListener(() => { rels.clear(); refresh(); }); chrome.permissions.onRemoved.addListener(() => { rels.clear(); refresh(); }); }

// ── Relationship + photo from the user's own LinkedIn session (optional permission), one request per profile ──
const LI_PERMS = { permissions: ['cookies'], origins: ['https://www.linkedin.com/*'] };
const rels = new Map();   // linkedinUrl → { loading } | relation result | { error }
function relFor(prof) {
  if (!liGranted || !prof || !prof.linkedinUrl) return null;
  const url = prof.linkedinUrl;
  if (!rels.has(url)) {
    rels.set(url, { loading: true });
    send({ type: 'li:relation', linkedinUrl: url }).then(r => r, () => null).then(r => { rels.set(url, r && r.ok ? r : { error: (r && r.error) || 'LI_FAILED' }); render(); });
  }
  const v = rels.get(url);
  return v && !v.loading && !v.error ? v : v && v.error ? v : null;
}
async function grantLinkedIn(btn) {
  let ok = false;
  try { ok = await chrome.permissions.request(LI_PERMS); } catch (_) {}
  if (!ok && btn) btn.textContent = t('li_rel_denied');
  if (ok) { liGranted = true; rels.clear(); render(); }
}
// Label + tone for a relationship. Connect is hidden when already connected, invited, or yourself.
const relLabel = rel => (!rel || rel.error ? null : ({ connected: [t('rel_connected'), 'ok'], pending: [t('rel_pending'), 'warn'], degree2: [t('rel_degree2'), ''], degree3: [t('rel_degree3'), ''], out: [t('rel_out'), ''], self: [t('rel_self'), ''] }[rel.relation] || null));
// A company name as a link, Rapportive style: its own website when known (provider domain, or LinkedIn's company
// data), else its LinkedIn company page, else a LinkedIn company search.
function companyLink(name, prof, rel, pos, cls = '') {
  const k = name.trim().toLowerCase();
  const li = (rel && rel.companies && rel.companies[k]) || null;
  const own = k === String(prof.company || '').trim().toLowerCase() && prof.companyDomain;
  const web = (pos && pos.domain && 'https://' + pos.domain) || (own && 'https://' + prof.companyDomain) || (li && li.web) || null;
  const href = web || (pos && pos.companyLinkedin) || (li && li.li) || 'https://www.linkedin.com/search/results/companies/?keywords=' + encodeURIComponent(name);
  const title = web ? new URL(web).hostname.replace(/^www\./, '') : href.includes('/search/') ? t('company_search_title') : t('company_li_title');
  return h('a', { class: 'colink ' + cls, href, target: '_blank', rel: 'noopener noreferrer', title }, name);
}
const canConnect = rel => !(rel && ['connected', 'pending', 'self'].includes(rel.relation));
// A link LinkedIn does not know (or an all-digits handle, which is an id, not a profile): offer a search instead.
const brokenLink = (prof, rel) => !!((rel && rel.missing) || /\/in\/\d+\/?$/.test(prof.linkedinUrl || ''));
const liSearchUrl = prof => 'https://www.linkedin.com/search/results/people/?keywords=' + encodeURIComponent([prof.fullName, prof.company].filter(Boolean).join(' '));
chrome.runtime.onMessage.addListener(msg => { if (msg && msg.type === 'panel:state' && msg.tabId === tabId) { state = msg.state; render(); loadFooter(); } });
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.settings) loadFooter(); });
// Re-read the shown relationships in place (old values stay on screen until the new ones arrive: no flicker).
let refreshing = false;
async function refreshRels() {
  if (refreshing || !liGranted || !rels.size) return; refreshing = true;
  try { await Promise.all([...rels.keys()].map(url => send({ type: 'li:relation', linkedinUrl: url }).then(r => { if (r && r.ok) rels.set(url, r); }, () => {}))); }
  finally { refreshing = false; render(); }
}
chrome.runtime.onMessage.addListener(msg => { if (msg && msg.type === 'li:changed') refreshRels(); });
// Back from the LinkedIn tab: re-read relationships (cached ones come back instantly; just-invited people are re-checked).
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshRels(); });
window.addEventListener('focus', refreshRels);
if (fixedTab == null && chrome.tabs && chrome.tabs.onActivated) chrome.tabs.onActivated.addListener(() => refresh());

// ── Pieces ──
function initialsOf(name) {
  const s = (name || '').trim();
  if (!s) return '?';
  if (/[一-鿿぀-ヿ가-힯]/.test(s)) return s.replace(/\s/g, '').slice(0, 1);
  const w = s.split(/\s+/).filter(Boolean);
  return ((w[0][0] || '') + (w.length > 1 ? w[w.length - 1][0] || '' : '')).toUpperCase();
}
function avatar(p, fallbackName) {
  const ini = h('div', { class: 'avatar ini', 'aria-hidden': 'true' }, initialsOf((p && p.fullName) || fallbackName));
  if (!p || !p.photoUrl || !/^https:\/\//.test(p.photoUrl)) return ini;
  const img = h('img', { class: 'avatar', src: p.photoUrl, alt: '', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(ini));
  return img;
}
const clocks = new Set();
setInterval(() => { for (const c of clocks) { if (!c.el.isConnected) { clocks.delete(c); continue; } c.el.textContent = clockText(c.tz); } }, 60000);
function clockText(tz) { try { return t('local_time', new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date())); } catch (_) { return ''; } }
function clock(tz) { if (!tz) return null; const text = clockText(tz); if (!text) return null; const el = h('span', { title: t('local_time_title', tz) }, text); clocks.add({ el, tz }); return el; }
const statusOf = r => (!r ? 'idle' : r.pending ? 'loading' : r.ok === false ? (r.error === 'AUTO_LIMIT' ? 'idle' : 'error') : r.status || 'idle');
const hintFor = reason => ({ auto_off: t('hint_auto_off'), noisy: t('hint_noisy'), me: t('hint_me') }[reason] || t('hint_manual'));
const matchBadge = r => (r.match && r.match.nameMatched === true ? badge(t('name_match'), 'ok') : r.match && r.match.nameMatched === false ? badge(t('name_mismatch'), 'warn') : badge(r.match && r.match.step === 'signature' ? t('from_signature') : t('by_email')));
const lookup = (p, force) => send({ type: 'panel:lookup', tabId, email: p.email, name: p.name, force: force === true }).catch(() => {});
// ── Icons (static markup, no user data) ──
const ICONS = {
  li: '<svg class="i" viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 2H3.55C2.7 2 2 2.7 2 3.55v16.9C2 21.3 2.7 22 3.55 22h16.9c.85 0 1.55-.7 1.55-1.55V3.55C22 2.7 21.3 2 20.45 2zM8.34 19.04H5.37V9.5h2.97v9.54zM6.85 8.2a1.72 1.72 0 1 1 0-3.44 1.72 1.72 0 0 1 0 3.44zm12.19 10.84h-2.96v-4.64c0-1.1-.02-2.53-1.54-2.53-1.55 0-1.78 1.2-1.78 2.45v4.72H9.8V9.5h2.84v1.3h.04c.4-.75 1.37-1.54 2.81-1.54 3 0 3.56 1.98 3.56 4.55v5.23z"/></svg>',
  connect: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M19 8v6M16 11h6"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24" fill="currentColor"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2z"/></svg>',
  check: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  more: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  gear: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  moon: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun: '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
};
const icon = (name, cls) => { const s = document.createElement('span'); s.innerHTML = ICONS[name]; const el = s.firstChild; if (cls) el.classList.add(cls); return el; };

// "Zorrilla, Olivia" and "Olivia Zorrilla" are the same person: only mention the email's name when it really differs.
const nameTokens = s => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const sameName = (a, b) => { const A = new Set(nameTokens(a)); const B = nameTokens(b); return B.length > 0 && B.every(x => A.has(x)); };
// The headline usually repeats "title at company"; show it only when it adds something.
const headlineAdds = (headline, title, company) => {
  if (!headline) return false;
  const hl = headline.toLowerCase();
  return ![title, company].filter(Boolean).every(x => hl.includes(x.toLowerCase()));
};
// Email display names like "Cope, Harrison, Sony Music" → "Harrison Cope"; anything else is kept as is.
const displayName = n => { const m = /^\s*([^,]+),\s*([^,]+)(,.*)?$/.exec(n || ''); return m && !/\s/.test(m[1].trim()) ? m[2].trim() + ' ' + m[1].trim() : (n || '').replace(/,\s*$/, '').trim(); };

function connectButton(p, r, { compact = false } = {}) {
  const prof = r.profile;
  const idle = () => { btn.replaceChildren(); if (compact) btn.append(icon('connect')); else btn.append(icon('connect', 'ic'), h('span', { class: 'lbl' }, t('connect_btn'))); };
  const btn = h('button', { class: compact ? 'icon' : '', type: 'button', title: t('connect_title_attr'), 'aria-label': t('connect_btn'), 'data-act': 'connect', onclick: async () => {
    btn.disabled = true;
    let note;
    try { const res = await send({ type: 'connect:start', linkedinUrl: prof.linkedinUrl, fullName: prof.fullName, company: prof.company, email: p.email }); note = res && res.ok ? t('connect_opening') : errorLabel(res); }
    catch (_) { note = t('err_generic'); }
    btn.replaceChildren(compact ? h('span', { class: 'note' }, note) : h('span', { class: 'lbl' }, note));
    setTimeout(() => { idle(); btn.disabled = false; }, 4000);
  } });
  idle();
  return btn;
}
const liLink = (url, compact) => compact
  ? h('a', { class: 'li', href: url, target: '_blank', rel: 'noopener noreferrer', title: t('li_profile'), 'aria-label': t('li_profile') }, icon('li'))
  : h('a', { class: 'li', href: url, target: '_blank', rel: 'noopener noreferrer' }, icon('li', 'ic-li'), h('span', { class: 'lbl' }, t('li_profile')), h('span', { class: 'go' }, '↗'));

// ── The main person ──
function primary(p, r) {
  const st = statusOf(r);
  const prof = (st === 'found' || st === 'uncertain') ? r.profile : null;
  const card = h('section', { class: 'person primary', 'data-status': st, 'data-email': p.email });
  const name = (prof && prof.fullName) || displayName(p.name) || p.email;
  const rel = prof ? relFor(prof) : null, rl = relLabel(rel);
  card.append(h('h2', { class: 'name' }, name, rl ? h('span', { class: 'deg ' + rl[1] }, rl[0]) : null));
  const facts = h('div', { class: 'facts' }, h('div', { class: 'email' }, p.email));
  if (prof) {
    const tz = clock(prof.timeZone);
    if (prof.location) facts.append(h('div', { class: 'loc' }, prof.location));
    if (tz) facts.append(h('div', { class: 'loc' }, tz));
  }
  card.append(h('div', { class: 'head' }, avatar(prof && { ...prof, photoUrl: (rel && rel.photoUrl) || prof.photoUrl }, name), facts));

  if (st === 'loading') card.append(h('div', { class: 'state' }, h('span', { class: 'muted' }, h('span', { class: 'spin' }), t('looking_up', p.email))));
  else if (st === 'idle') card.append(h('div', { class: 'state' }, h('span', { class: 'msg' }, r && r.ok === false ? r.message : hintFor(state.reason)), h('button', { class: 'pill', 'data-act': 'lookup', onclick: () => lookup(p, false) }, t('lookup_btn'))));
  else if (st === 'error') card.append(h('div', { class: 'state' }, badge(errorLabel(r), 'err'), (r && r.message) ? h('span', { class: 'msg' }, r.message) : null,
    r && r.error === 'NO_KEYS' ? h('button', { class: 'pill', onclick: () => chrome.runtime.openOptionsPage() }, t('open_settings')) : null,
    h('button', { class: 'pill', onclick: () => lookup(p, false) }, t('retry'))));
  else if (st === 'skipped') { const why = { free_mail_provider: t('skip_free_mail'), role_address: t('skip_role') }[r.skippedReason] || t('skipped_generic', r.skippedReason || ''); card.append(h('div', { class: 'state' }, h('span', { class: 'msg' }, why), h('button', { class: 'pill', 'data-act': 'lookup', onclick: () => lookup(p, true) }, t('lookup_anyway')))); }
  else if (st === 'not_found') card.append(h('div', { class: 'state' }, h('span', { class: 'msg' }, t('not_found_for', p.email)), h('button', { class: 'pill', onclick: () => lookup(p, true) }, t('lookup_again'))));
  else {
    const pos = (prof.positions || []).filter(x => x.current && (x.title || x.company)).slice(0, 3);
    if (prof.title || prof.company) card.append(h('div', { class: 'role' }, prof.title || null, prof.title && prof.company ? h('span', { class: 'co' }, ' · ') : null, prof.company ? companyLink(prof.company, prof, rel, null, prof.title ? 'co' : '') : null));
    if (headlineAdds(prof.headline, prof.title, prof.company)) card.append(h('div', { class: prof.title || prof.company ? 'headline' : 'role' }, prof.headline));
    if (pos.length > 1) card.append(h('ul', { class: 'roles', 'aria-label': t('current_roles') }, ...pos.map(x => h('li', {}, x.title || null, x.title && x.company ? ' @ ' : null, x.company ? companyLink(x.company, prof, rel, x) : null))));
    // Profile + Connect side by side; when already connected (or invited) the second half says so instead.
    const second = canConnect(rel) ? connectButton(p, r)
      : h('span', { class: 'relnote ' + (rel.relation === 'connected' ? 'ok' : rel.relation === 'pending' ? 'warn' : '') }, rel.relation === 'connected' ? icon('check', 'ic') : null, h('span', { class: 'lbl' }, rel.relation === 'connected' ? t('rel_connected_long') : rl[0]));
    if (brokenLink(prof, rel)) card.append(h('div', { class: 'broken' }, h('span', { class: 'msg' }, t('li_link_broken')),
      h('a', { class: 'li', href: liSearchUrl(prof), target: '_blank', rel: 'noopener noreferrer', 'data-act': 'li-search' }, icon('li', 'ic-li'), h('span', {}, t('li_search_person')), h('span', { class: 'go' }, '↗')),
      h('div', { class: 'fix' }, h('button', { class: 'pill', type: 'button', 'data-act': 'relookup', onclick: () => lookup(p, true) }, t('lookup_again')), h('span', { class: 'hint' }, t('li_relookup_hint')))));
    else card.append(h('div', { class: 'actions' }, liLink(prof.linkedinUrl), second));
    if (prof.twitterUrl) card.append(h('div', { class: 'xlink' }, h('a', { href: prof.twitterUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('x', 'ic'), 'X / Twitter ↗')));
    // One quiet line of provenance: how sure, where from, what it cost.
    const meta = h('div', { class: 'meta' });
    if (st === 'uncertain') meta.append(badge(t('status_uncertain'), 'warn')); else meta.append(matchBadge(r));
    if (p.name && prof.fullName && !sameName(p.name, prof.fullName)) meta.append(h('span', {}, t('header_name_vs_profile', [p.name, prof.fullName])));
    if (r.cached) meta.append(h('span', {}, t('cached')));
    if (r.match && r.match.step) meta.append(h('span', {}, t('source', r.match.step === 'signature' ? t('source_signature') : (r.match.provider || r.match.step).replace(/^[a-z]+:/, ''))));
    if (showCost && r.cost) meta.append(h('span', {}, t('cost', usd(r.cost.usd))));
    meta.append(h('span', {}, h('button', { class: 'tlink', onclick: () => lookup(p, true) }, t('lookup_again'))));
    card.append(meta);
    if (!liGranted) card.append(h('button', { class: 'grant', type: 'button', title: t('li_grant_title'), 'data-act': 'li-grant', onclick: e => grantLinkedIn(e.currentTarget) }, icon('li', 'ic-li'), h('span', {}, t('li_grant'))));
    else if (rel && rel.error === 'LI_SIGNED_OUT') card.append(h('div', { class: 'meta' }, h('span', {}, t('li_signed_out'))));
  }
  return card;
}

// ── Other people in the thread: one compact line each, looked up only on click ──
function row(p, r) {
  const st = statusOf(r);
  const prof = (st === 'found' || st === 'uncertain') ? r.profile : null;
  const name = (prof && prof.fullName) || displayName(p.name) || p.email.split('@')[0];
  const rel = prof ? relFor(prof) : null, rl = relLabel(rel);
  const nm = h('span', { class: 'nm' }, name, rl ? h('span', { class: 'deg ' + rl[1] }, rl[0]) : null, st === 'uncertain' ? badge(t('status_uncertain'), 'warn') : null);
  const subText = prof ? [prof.title || prof.headline, prof.company].filter(Boolean).join(' · ') || p.email : p.email;
  const sub = h('span', { class: 'sub', title: subText }, subText);
  const acts = h('div', { class: 'acts' });
  if (st === 'loading') acts.append(h('span', { class: 'spin' }));
  else if (st === 'idle') acts.append(h('button', { class: 'pill', 'data-act': 'lookup', onclick: () => lookup(p, false) }, t('lookup_short')));
  else if (st === 'error') { sub.replaceChildren(badge(errorLabel(r), 'err')); acts.append(h('button', { class: 'pill', onclick: () => lookup(p, false) }, t('retry'))); }
  else if (st === 'skipped') { sub.textContent = (r.skippedReason === 'free_mail_provider' ? t('personal_mail') : t('role_mail')) + ' · ' + p.email; acts.append(h('button', { class: 'pill', onclick: () => lookup(p, true) }, t('lookup_anyway'))); }
  else if (st === 'not_found') { sub.textContent = t('not_found_short') + ' · ' + p.email; acts.append(h('button', { class: 'pill', onclick: () => lookup(p, true) }, t('lookup_again'))); }
  else if (brokenLink(prof, rel)) { sub.textContent = t('li_link_broken_short'); acts.append(h('a', { class: 'li', href: liSearchUrl(prof), target: '_blank', rel: 'noopener noreferrer', title: t('li_search_person'), 'aria-label': t('li_search_person') }, icon('li'))); }
  else acts.append(...[liLink(prof.linkedinUrl, true), canConnect(rel) ? connectButton(p, r, { compact: true }) : null,
    h('button', { class: 'icon', type: 'button', title: t('show_details'), 'aria-label': t('show_details'), 'data-act': 'details', onclick: () => focus(p) }, icon('more'))].filter(Boolean));
  const who = h('button', { class: 'who', title: p.email + ' — ' + t('show_details'), 'data-act': 'focus', onclick: () => focus(p) }, nm, sub);
  return h('div', { class: 'row', 'data-status': st, 'data-email': p.email }, avatar(prof && { ...prof, photoUrl: (rel && rel.photoUrl) || prof.photoUrl }, name), who, acts);
}
// Make a participant the main card (nothing is spent; a cached result is reused).
const focus = p => send({ type: 'panel:focus', tabId, email: p.email, name: p.name }).catch(() => {});

function render() {
  const main = $('main'); main.replaceChildren();
  if (!state || state.empty || !state.subject) { main.append(h('div', { class: 'empty' }, h('h2', {}, t('panel_empty_title')), h('p', { class: 'muted' }, t('panel_empty_hint')))); return; }
  const { subject, participants = [], results = {} } = state;
  main.append(primary(subject, results[subject.email]));
  if (participants.length) {
    const sec = h('section', { class: 'others' }, h('h3', {}, t('others_in_thread', participants.length)));
    for (const p of participants) sec.append(row(p, results[p.email]));
    main.append(sec);
  }
}

// ── Footer: key status, today's numbers, the two switches ──
async function loadFooter() {
  const s = await send({ type: 'ui:settings' }).catch(() => null);
  if (s && s.ok) {
    showCost = s.showCost !== false;
    $('autoLookup').checked = s.autoLookup; $('showCost').checked = s.showCost;
    $('status').hidden = !!s.hasKeys; $('status').className = 'status warn'; $('status').textContent = s.hasKeys ? '' : t('popup_no_keys');
  }
  const st = await send({ type: 'stats' }).catch(() => null);
  if (st && st.ok) $('today').textContent = t('today_line', [st.today.lookups, usd(st.budget.spentTodayUsd), usd(st.budget.dailyCapUsd), st.budget.autoToday, st.budget.autoDailyLimit]);
}
$('autoLookup').addEventListener('change', e => send({ type: 'settings:set', patch: { autoLookup: e.target.checked } }));
$('showCost').addEventListener('change', e => { showCost = e.target.checked; send({ type: 'settings:set', patch: { showCost: e.target.checked } }).then(render); });
$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('settings').append(icon('gear'));
// Header toggle flips between light and dark; Settings also offers "match the system".
const themeIcon = th => $('theme').replaceChildren(icon(th === 'dark' ? 'sun' : 'moon'));
onThemeChange(themeIcon);
$('theme').addEventListener('click', () => { const next = effectiveTheme() === 'dark' ? 'light' : 'dark'; applyTheme(next); send({ type: 'settings:set', patch: { theme: next } }); });
themeIcon(effectiveTheme());
watchTheme();

localizeDocument();
refresh();
