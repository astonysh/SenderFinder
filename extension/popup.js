'use strict';
const $ = id => document.getElementById(id);
const DEFAULTS = { serverUrl: 'http://127.0.0.1:3390', token: '', autoLookup: true, showCost: true };
const status = (msg, cls = '') => { $('status').textContent = msg; $('status').className = 'status ' + cls; };

chrome.storage.local.get(DEFAULTS).then(s => {
  $('serverUrl').value = s.serverUrl || DEFAULTS.serverUrl; $('token').value = s.token || ''; $('autoLookup').checked = !!s.autoLookup; $('showCost').checked = s.showCost !== false;
  $('open').href = ($('serverUrl').value || DEFAULTS.serverUrl).replace(/\/+$/, '') + '/';
});

async function ensureHostPermission(url) {
  let origin;
  try { origin = new URL(url).origin + '/*'; } catch (_) { return false; }
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/\*$/.test(origin)) return true;
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] });
}

$('save').addEventListener('click', async () => {
  const serverUrl = $('serverUrl').value.trim().replace(/\/+$/, '') || DEFAULTS.serverUrl;
  if (!/^https?:\/\//.test(serverUrl)) return status('服务器地址必须以 http:// 或 https:// 开头', 'err');
  if (!(await ensureHostPermission(serverUrl))) return status('需要授权访问该服务器地址', 'err');
  await chrome.storage.local.set({ serverUrl, token: $('token').value.trim(), autoLookup: $('autoLookup').checked, showCost: $('showCost').checked });
  $('open').href = serverUrl + '/';
  status('已保存', 'ok');
});

$('test').addEventListener('click', async () => {
  status('正在测试…');
  const serverUrl = $('serverUrl').value.trim().replace(/\/+$/, '') || DEFAULTS.serverUrl;
  const token = $('token').value.trim();
  if (!(await ensureHostPermission(serverUrl))) return status('需要授权访问该服务器地址', 'err');
  try {
    const h = await fetch(serverUrl + '/api/health').then(r => r.json());
    if (!h.ok) return status('服务器响应异常', 'err');
    const on = Object.entries(h.providers || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || '无';
    if (!token) return status(`服务器在线（v${h.version}），供应商：${on}。还未填写令牌。`, 'ok');
    const r = await fetch(serverUrl + '/api/steps', { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 401) return status(`服务器在线，但令牌无效。`, 'err');
    status(`连接正常（v${h.version}），供应商：${on}，步骤：${(h.steps || []).join(' → ')}`, 'ok');
  } catch (_) { status('无法连接 ' + serverUrl, 'err'); }
});
