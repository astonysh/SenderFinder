// Options page: settings, history, stats, data. Talks to the service worker only; never touches providers itself.
import { t, localizeDocument } from './lib/i18n.js';
import { applyTheme, watchTheme } from './lib/theme.js';
const $ = id => document.getElementById(id);
const send = msg => chrome.runtime.sendMessage(msg);
const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v != null) el.setAttribute(k, v); } for (const k of kids.flat()) if (k != null) el.append(k); return el; };
const usd = n => (n == null ? '—' : n === 0 ? '$0' : n < 0.01 ? '$' + Number(n).toFixed(4) : '$' + Number(n).toFixed(3));
const LANG = chrome.i18n.getUILanguage();
const when = iso => {
  if (!iso) return '—';
  const d = new Date(iso), now = new Date(), time = d.toLocaleTimeString(LANG, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  return d.toLocaleDateString(LANG, { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) }) + ' ' + time;
};
const whenFull = iso => (iso ? new Date(iso).toLocaleString(LANG, { dateStyle: 'full', timeStyle: 'short' }) : '');
const profileLink = (p, cls) => h('a', { class: cls, href: p.linkedinUrl, target: '_blank', rel: 'noopener' }, p.fullName || p.linkedinUrl.replace(/^https:\/\/www\.linkedin\.com\/in\//, '').replace(/\/$/, ''));
const sameName = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
const STATUS = () => ({ found: [t('status_found'), 'ok'], uncertain: [t('status_uncertain'), 'warn'], not_found: [t('status_not_found'), ''], skipped: [t('status_skipped'), ''] });
const SKIP = () => ({ free_mail_provider: t('personal_mail'), role_address: t('role_mail'), daily_budget: t('reason_daily_budget'), invalid_email: t('reason_invalid_email') });
const badge = (text, cls = '') => h('span', { class: 'badge ' + cls }, text);
let toastT; function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200); }

// ── Tabs ──
const tabs = [...document.querySelectorAll('.tabs [role=tab]')];
function showTab(name) {
  tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tab').forEach(s => { s.hidden = s.id !== 'tab-' + name; });
  location.hash = name;
  if (name === 'history') loadHistory(true);
  if (name === 'stats') loadStats();
}
tabs.forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ── Settings ──
let settings = null, steps = [];
function fillSettings() {
  $('key-monid').value = settings.keys.monid; $('key-treg').value = settings.keys.treg; $('key-firecrawl').value = settings.keys.firecrawl;
  for (const id of ['lookupMaxUsd', 'dailyCapUsd', 'autoDailyLimit', 'cacheMaxAgeDays', 'firecrawlUsdPerCredit']) $(id).value = settings[id];
  for (const id of ['autoLookup', 'skipFreeMail', 'showCost', 'telemetry']) $(id).checked = settings[id];
  $('theme').value = settings.theme || 'system';
  $('connectNote').value = settings.connectNote || ''; $('connectSignature').checked = settings.connectSignature !== false;
  connectPreview();
  renderSteps();
  renderVendors();
}
// One box per vendor: key status plus the steps that key unlocks, so a user who only has one key can see what it buys.
function renderVendors() {
  const byVendor = {};
  for (const st of steps) (byVendor[st.vendor] = byVendor[st.vendor] || []).push(st);
  for (const box of document.querySelectorAll('.vendor[data-vendor]')) {
    const v = box.dataset.vendor, list = byVendor[v] || [], configured = list.length ? list[0].configured : !!settings.keys[v];
    box.dataset.configured = String(configured);
    const stat = box.querySelector('[data-vendor-status]');
    stat.className = 'badge ' + (configured ? 'ok' : 'warn'); stat.textContent = configured ? t('configured') : t('missing_key');
    const ul = box.querySelector('[data-vendor-steps]'); ul.replaceChildren();
    for (const st of list) ul.append(h('li', { class: st.enabled ? '' : 'off' },
      h('span', {}, chrome.i18n.getMessage('step_' + st.id) || st.label, st.enabled ? null : h('span', { class: 'off-tag' }, '(' + t('step_off') + ')')),
      h('span', { class: 'price' }, st.maxUsd ? usd(st.maxUsd) + (st.credits ? ` · ${st.credits} cr` : '') : t('free'))));
  }
  $('keys-need').hidden = !!(settings.keys.treg || settings.keys.monid || settings.keys.firecrawl);
}
function renderSteps() {
  const tb = $('steps'); tb.replaceChildren();
  steps.forEach((s, i) => {
    const tr = h('tr', { class: s.enabled ? '' : 'off' },
      h('td', {}, h('input', { type: 'checkbox', ...(s.enabled ? { checked: '' } : {}), onchange: e => save({ stepsEnabled: { ...settings.stepsEnabled, [s.id]: e.target.checked } }) })),
      h('td', {}, chrome.i18n.getMessage('step_' + s.id) || s.label, ' ', h('span', { class: 'mono muted' }, s.id)),
      h('td', {}, s.vendor === 'local' ? t('local') : s.vendor),
      h('td', { class: 'num' }, s.maxUsd ? usd(s.maxUsd) + (s.credits ? ` (${s.credits} credits)` : '') : t('free')),
      h('td', {}, s.vendor === 'local' ? badge(t('always_on'), 'ok') : s.configured ? badge(t('configured'), 'ok') : badge(t('missing_key'), 'warn')),
      h('td', { class: 'num' }, h('button', { class: 'ghost tiny', title: t('move_up'), ...(i === 0 ? { disabled: '' } : {}), onclick: () => move(i, -1) }, '↑'), ' ', h('button', { class: 'ghost tiny', title: t('move_down'), ...(i === steps.length - 1 ? { disabled: '' } : {}), onclick: () => move(i, 1) }, '↓')));
    tb.append(tr);
  });
}
function move(i, d) { const order = steps.map(s => s.id); const [x] = order.splice(i, 1); order.splice(i + d, 0, x); save({ stepOrder: order }); }
async function save(patch) {
  const r = await send({ type: 'settings:set', patch });
  if (!r || !r.ok) return toast(t('save_failed'));
  settings = r.settings; steps = r.steps; fillSettings(); toast(t('saved'));
}
for (const [id, key] of [['key-monid', 'monid'], ['key-treg', 'treg'], ['key-firecrawl', 'firecrawl']]) $(id).addEventListener('change', e => save({ keys: { [key]: e.target.value } }));
for (const id of ['lookupMaxUsd', 'dailyCapUsd', 'autoDailyLimit', 'cacheMaxAgeDays', 'firecrawlUsdPerCredit']) $(id).addEventListener('change', e => save({ [id]: Number(e.target.value) }));
for (const id of ['autoLookup', 'skipFreeMail', 'showCost']) $(id).addEventListener('change', e => save({ [id]: e.target.checked }));
$('theme').addEventListener('change', e => { applyTheme(e.target.value); save({ theme: e.target.value }); });
watchTheme();
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.settings && c.settings.newValue) $('theme').value = c.settings.newValue.theme || 'system'; });
// ── Connect on LinkedIn: template preview, char count, optional-permission status ──
let cpT;
async function connectPreview() {
  const r = await send({ type: 'connect:preview', template: $('connectNote').value || null, signature: $('connectSignature').checked });
  if (!r || !r.ok) return;
  if (!$('connectNote').value) $('connectNote').placeholder = r.defaultTemplate;
  $('connect-preview').textContent = r.note; $('connect-chars').textContent = t('opt_connect_chars', r.note.length);
  const p = await send({ type: 'connect:permission' });
  if (p && p.ok) { $('connect-perm').textContent = p.granted ? t('opt_connect_perm_granted') : t('opt_connect_perm_none'); $('connect-perm').dataset.granted = String(!!p.granted); $('connect-revoke').hidden = !p.granted; }
}
$('connectNote').addEventListener('input', () => { clearTimeout(cpT); cpT = setTimeout(connectPreview, 200); });
$('connectNote').addEventListener('change', e => save({ connectNote: e.target.value }));
$('connectSignature').addEventListener('change', e => save({ connectSignature: e.target.checked }));
$('connect-revoke').addEventListener('click', async () => { await send({ type: 'connect:revoke' }); connectPreview(); });

$('telemetry').addEventListener('change', async e => {
  const r = await send({ type: 'telemetry:set', enabled: e.target.checked });
  if (!r || !r.ok) return toast(t('save_failed'));
  settings = r.settings; steps = r.steps; fillSettings(); $('tele-out').hidden = true;
  toast(settings.telemetry ? t('tele_on_toast') : t('tele_off_toast'));
});
$('tele-preview').addEventListener('click', async () => {
  const r = await send({ type: 'telemetry:preview' });
  if (!r || !r.ok) return;
  $('tele-status').textContent = t('tele_status', [r.enabled ? t('on') : t('off'), r.endpoint]) + (r.pending.length ? ' · ' + t('tele_pending', r.pending.length) : '');
  $('tele-out').textContent = JSON.stringify(r.days, null, 2); $('tele-out').hidden = false;
});
$('showKeys').addEventListener('change', e => { for (const id of ['key-monid', 'key-treg', 'key-firecrawl']) $(id).type = e.target.checked ? 'text' : 'password'; });
$('probe').addEventListener('click', async () => {
  const out = $('probe-out'); out.textContent = t('probe_running'); $('probe').disabled = true;
  const r = await send({ type: 'probe' }); $('probe').disabled = false; out.replaceChildren();
  if (!r || !r.ok) { out.textContent = t('probe_failed'); return; }
  const parts = [];
  for (const [k, v] of Object.entries({ monid: r.monid, treg: r.treg, firecrawl: r.firecrawl })) {
    if (!v) { parts.push(h('span', {}, badge(t('probe_not_set', k), ''))); continue; }
    const det = (v.steps || []).map(s => s.error ? `${s.id} ✗ ${s.error}${s.status ? ' ' + s.status : ''}` : `${s.id} ${usd(s.usd)}${s.hitRate != null ? ' ' + t('hit_rate') + ' ' + Math.round(s.hitRate * 100) + '%' : ''}`).join(' · ');
    parts.push(h('span', {}, badge(v.ok ? t('probe_valid', k) : t('probe_invalid', k), v.ok ? 'ok' : 'err'), ' ', h('span', { class: 'muted' }, det || (v.error ? String(v.error) + (v.detail ? ' ' + v.detail : '') : ''))));
  }
  out.append(...parts.flatMap((p, i) => (i ? [h('br'), p] : [p])));
});

// ── Single lookup ──
function renderResult(r) {
  const box = $('lk-result'); box.hidden = false; box.replaceChildren();
  if (!r || r.ok === false) { box.append(h('p', { class: 'err-line' }, h('strong', {}, (r && r.error) || t('err_generic')), r && r.message ? ' ' + r.message : '')); return; }
  const [label, cls] = STATUS()[r.status] || [r.status, ''];
  const p = r.profile && r.profile.linkedinUrl ? r.profile : null;
  box.append(p ? profileLink(p, 'who') : h('div', { class: 'who' }, r.email));
  const role = p && [p.title || p.headline, p.company, p.location].filter(Boolean).join(' · ');
  if (role) box.append(h('div', { class: 'role' }, role));
  const match = p && r.match ? t('match_source', [r.match.provider || '', r.match.nameMatched === true ? t('name_matched') : r.match.nameMatched === false ? t('name_differs', [r.match.nameGiven, p.fullName || '?']) : t('name_not_compared')]) : null;
  box.append(h('div', { class: 'meta' }, badge(label, cls), p ? h('span', {}, r.email) : null, r.cached ? h('span', {}, t('cached')) : null, match ? h('span', {}, match) : null,
    r.status === 'skipped' ? h('span', {}, SKIP()[r.skippedReason] || r.skippedReason || '') : null, h('span', { class: 'num' }, t('cost_label', usd(r.cost && r.cost.usd))),
    r.status === 'skipped' ? h('button', { type: 'button', class: 'link', onclick: () => runLookup(r.email, '', true) }, t('lookup_anyway')) : null));
  const calls = (r.cost && r.cost.calls) || [];
  if (calls.length) box.append(h('div', { class: 'trace' }, h('div', { class: 'trace-title' }, t('trace_title')), h('table', {},
    h('tbody', {}, calls.map(c => h('tr', { class: c.status === 'hit' ? 'hit' : '' }, h('td', { class: 'mono' }, c.step), h('td', {}, c.status + (c.reason ? ' (' + c.reason + ')' : '') + (c.error ? ' ' + c.error : '')), h('td', { class: 'num' }, usd(c.usd)), h('td', { class: 'num' }, c.ms != null ? c.ms + ' ms' : '')))))));
}
async function runLookup(email, name, force) {
  $('lk-go').disabled = true; $('lk-result').hidden = false; $('lk-result').textContent = t('looking_up_short');
  try { renderResult(await send({ type: 'lookup', email, name, force, source: 'options' })); } finally { $('lk-go').disabled = false; loadHistory(true); }
}
$('lookup-form').addEventListener('submit', e => { e.preventDefault(); runLookup($('lk-email').value.trim(), $('lk-name').value.trim(), $('lk-force').checked); });

// ── History ──
let hOffset = 0, hTotal = 0, hItems = [];
async function loadHistory(reset) {
  if (reset) { hOffset = 0; hItems = []; $('h-rows').replaceChildren(); }
  const r = await send({ type: 'history:list', limit: 50, offset: hOffset, q: $('h-q').value, status: $('h-status').value });
  if (!r || !r.ok) return;
  hTotal = r.total; hOffset += r.items.length; hItems = hItems.concat(r.items);
  for (const it of r.items) $('h-rows').append(historyRow(it));
  $('h-count').textContent = !hTotal ? t('history_empty') : hItems.length < hTotal ? t('history_count', [hTotal, hItems.length]) : hTotal === 1 ? t('history_count_one') : t('history_count_all', hTotal);
  $('h-more').hidden = hItems.length >= hTotal;
}
// One person per row: who (name → LinkedIn, role, address) · status and how it was found · cost and time · actions.
function historyRow(it) {
  const [label, cls] = STATUS()[it.status] || [it.status, ''];
  const p = it.profile && it.profile.linkedinUrl ? it.profile : null;
  const role = p && [p.title || p.headline, p.company].filter(Boolean).join(' · ');
  const address = it.nameGiven && !sameName(it.nameGiven, p && p.fullName) ? it.email + ' · ' + it.nameGiven : it.email;
  const who = p ? [profileLink(p, 'who'), role ? h('div', { class: 'role', title: role }, role) : null, h('div', { class: 'addr' }, address)]
    : it.nameGiven ? [h('div', { class: 'who plain' }, it.nameGiven), h('div', { class: 'addr' }, it.email)] : [h('div', { class: 'who plain' }, it.email)];
  const how = it.status === 'skipped' ? SKIP()[it.skippedReason] || '' : it.match && it.match.step ? t('via_step', it.match.step) : '';
  const relookup = () => { $('lk-email').value = it.email; $('lk-name').value = it.nameGiven || ''; $('lookup-form').scrollIntoView({ block: 'nearest' }); runLookup(it.email, it.nameGiven || '', true); };
  const remove = async () => { await send({ type: 'history:delete', email: it.email }); loadHistory(true); };
  return h('tr', { 'data-status': it.status },
    h('td', { class: 'person' }, who),
    h('td', { class: 'state' }, badge(label, cls), how ? h('div', { class: 'sub' }, how) : null),
    h('td', { class: 'num' }, h('div', {}, usd(it.cost && it.cost.usd)), h('div', { class: 'sub', title: whenFull(it.lookedUpAt) }, when(it.lookedUpAt))),
    h('td', { class: 'act' }, h('button', { type: 'button', class: 'link', title: t('relookup_title'), onclick: relookup }, t('relookup')), h('button', { type: 'button', class: 'link del', onclick: remove }, t('delete'))));
}
$('h-more').addEventListener('click', () => loadHistory(false));
let hT; $('h-q').addEventListener('input', () => { clearTimeout(hT); hT = setTimeout(() => loadHistory(true), 250); });
$('h-status').addEventListener('change', () => loadHistory(true));
$('h-csv').addEventListener('click', async () => {
  const r = await send({ type: 'history:list', limit: 500, offset: 0, q: $('h-q').value, status: $('h-status').value });
  if (!r || !r.ok) return;
  const cols = ['email', 'name_given', 'status', 'linkedin_url', 'full_name', 'title', 'company', 'location', 'step', 'name_matched', 'usd', 'skipped_reason', 'looked_up_at'];
  const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = r.items.map(it => [it.email, it.nameGiven, it.status, it.profile && it.profile.linkedinUrl, it.profile && it.profile.fullName, it.profile && it.profile.title, it.profile && it.profile.company, it.profile && it.profile.location, it.match && it.match.step, it.match && it.match.nameMatched, it.cost && it.cost.usd, it.skippedReason, it.lookedUpAt].map(esc).join(','));
  download('senderfinder-history.csv', '﻿' + [cols.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8');
});
function download(name, text, type) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

// ── Stats ──
async function loadStats() {
  const s = await send({ type: 'stats' }); if (!s || !s.ok) return;
  const card = (l, v, sub) => h('div', { class: 'stat' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'sub s' }, sub));
  $('stat-cards').replaceChildren(
    card(t('stats_today'), t('n_lookups', s.today.lookups), t('found_n_usd', [s.today.found, usd(s.today.usd)])),
    card(t('stats_month'), t('n_lookups', s.month.lookups), t('found_n_usd', [s.month.found, usd(s.month.usd)])),
    card(t('stats_all'), t('n_lookups', s.allTime.lookups), t('found_n_usd_cache', [s.allTime.found, usd(s.allTime.usd), s.cacheEntries])),
    card(t('stats_budget'), `${usd(s.budget.spentTodayUsd)} / ${usd(s.budget.dailyCapUsd)}`, t('auto_n_cap', [s.budget.autoToday, s.budget.autoDailyLimit, usd(s.budget.lookupMaxUsd)])));
  const max = Math.max(1, ...s.daily.map(d => d.lookups));
  $('chart').replaceChildren(...s.daily.map(d => h('div', { class: 'bar' + (d.lookups ? '' : ' zero'), style: `height:${Math.max(2, Math.round(d.lookups / max * 100))}%`, 'data-tip': t('chart_tip', [d.day, d.lookups, d.found, usd(d.usd)]) })));
  $('chart-legend').textContent = t('chart_legend', max);
  $('prov-rows').replaceChildren(...(s.providers.length ? s.providers.map(p => h('tr', {}, h('td', { class: 'mono' }, p.provider), h('td', { class: 'num' }, p.calls), h('td', { class: 'num' }, p.hits), h('td', { class: 'num' }, p.calls ? Math.round(p.hits / p.calls * 100) + '%' : '—'), h('td', { class: 'num' }, p.errors || 0), h('td', { class: 'num' }, usd(p.usd)), h('td', { class: 'num' }, p.calls ? Math.round(p.ms / p.calls) + ' ms' : '—')))
    : [h('tr', {}, h('td', { colspan: 7, class: 'muted' }, t('no_paid_calls')))]));
}

// ── Data ──
$('d-export').addEventListener('click', async () => { const r = await send({ type: 'data:export' }); if (r && r.ok) download(`senderfinder-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(r.data, null, 1), 'application/json'); });
async function importFile(file, replace) {
  if (!file) return;
  if (replace && !confirm(t('import_confirm_replace'))) return;
  let data; try { data = JSON.parse(await file.text()); } catch (_) { $('d-out').textContent = t('import_bad_json'); return; }
  const r = await send({ type: 'data:import', data, replace });
  $('d-out').textContent = r && r.ok ? t('import_done', r.imported) : t('import_failed', (r && r.message) || (r && r.error) || '');
}
$('d-import').addEventListener('change', e => { importFile(e.target.files[0], false); e.target.value = ''; });
$('d-import-replace').addEventListener('change', e => { importFile(e.target.files[0], true); e.target.value = ''; });
$('d-prune').addEventListener('click', async () => { const r = await send({ type: 'data:prune' }); $('d-out').textContent = r && r.ok ? t('prune_done', r.removed) : t('prune_failed'); });
$('d-clear').addEventListener('click', async () => { if (!confirm(t('clear_confirm'))) return; const r = await send({ type: 'data:clear' }); $('d-out').textContent = r && r.ok ? t('cleared') : t('failed'); });

// ── Boot ──
(async () => {
  localizeDocument();
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;
  const r = await send({ type: 'settings:get' });
  if (r && r.ok) { settings = r.settings; steps = r.steps; fillSettings(); }
  showTab(['settings', 'history', 'stats', 'data'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'settings');
})();
