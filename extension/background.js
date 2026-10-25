'use strict';
// Service worker: the only place that holds the token and talks to the server.
// Content scripts send {type:'lookup'|'health'|'settings'} messages; they never see the token.

const DEFAULTS = { serverUrl: 'http://127.0.0.1:3390', token: '', autoLookup: true, showCost: true };

async function settings() {
  const s = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...s, serverUrl: String(s.serverUrl || DEFAULTS.serverUrl).replace(/\/+$/, '') };
}

async function api(path, { method = 'GET', body } = {}) {
  const s = await settings();
  if (!s.token) return { ok: false, error: 'NO_TOKEN', message: '尚未设置令牌，请点扩展图标完成设置。' };
  let res;
  try {
    res = await fetch(s.serverUrl + path, { method, headers: { Authorization: 'Bearer ' + s.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (_) { return { ok: false, error: 'UNREACHABLE', message: '无法连接服务器 ' + s.serverUrl }; }
  let data = null;
  try { data = await res.json(); } catch (_) { /* fall through */ }
  if (!res.ok) return { ok: false, error: (data && data.error) || 'HTTP_' + res.status, message: (data && data.message) || ('服务器返回 ' + res.status), status: res.status };
  return data;
}

const inflight = new Map(); // email -> promise, so a re-rendered header does not trigger a second paid lookup

function fromMailPage(sender) {
  const u = sender && sender.tab && sender.tab.url ? sender.tab.url : (sender && sender.url) || '';
  return /^https:\/\/(mail\.google\.com|outlook\.(live|office|office365)\.com)\//.test(u);
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    if (!msg || typeof msg !== 'object') return { ok: false, error: 'BAD_MESSAGE' };
    if (msg.type === 'settings') { const s = await settings(); return { ok: true, autoLookup: s.autoLookup, showCost: s.showCost, serverUrl: s.serverUrl, hasToken: !!s.token }; }
    if (msg.type === 'health') { const s = await settings(); try { const r = await fetch(s.serverUrl + '/api/health'); return await r.json(); } catch (_) { return { ok: false, error: 'UNREACHABLE' }; } }
    if (msg.type === 'steps') return api('/api/steps');
    if (msg.type === 'lookup') {
      if (!fromMailPage(sender) && !(sender && sender.id === chrome.runtime.id && !sender.tab)) return { ok: false, error: 'FORBIDDEN' };
      const email = String(msg.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'INVALID_EMAIL', message: '无法识别发件人地址' };
      const key = email + (msg.force ? '!' : '');
      if (!msg.force && inflight.has(key)) return inflight.get(key);
      const p = api('/api/lookup', { method: 'POST', body: { email, name: msg.name ? String(msg.name).slice(0, 200) : undefined, signature: msg.signature ? String(msg.signature).slice(0, 20000) : undefined, source: msg.source === 'outlook' ? 'outlook' : 'gmail', force: msg.force === true } })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    }
    return { ok: false, error: 'UNKNOWN_TYPE' };
  })().then(respond, e => respond({ ok: false, error: 'INTERNAL', message: String(e && e.message || e) }));
  return true;
});
