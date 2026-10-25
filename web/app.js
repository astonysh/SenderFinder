/* Email → LinkedIn · 网页版
 * Plain script (not an ES module) so the page also works when opened from disk (file://),
 * where browsers refuse to load module scripts. No dependencies, no build step.
 */
(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════════════
   * Storage
   * ════════════════════════════════════════════════════════════════════ */
  const LS = { token: 'el.token', baseUrl: 'el.baseUrl', theme: 'el.theme' };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } },
  };
  const getToken = () => store.get(LS.token) || '';
  // Opened from disk (file://) there is no "same origin", so fall back to the documented default port.
  const FILE_DEFAULT_BASE = 'http://127.0.0.1:3390';
  const isFile = location.protocol === 'file:';
  const getBaseUrl = () => normalizeBase(store.get(LS.baseUrl) || (isFile ? FILE_DEFAULT_BASE : ''));

  function normalizeBase(v) {
    return String(v || '').trim().replace(/\/+$/, '');
  }
  function isValidBase(v) {
    if (!v) return true;
    try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (_) { return false; }
  }
  function maskToken(t) {
    if (!t) return '';
    return '••••••••' + (t.length > 10 ? t.slice(-4) : '');
  }

  /* ════════════════════════════════════════════════════════════════════
   * DOM helpers (all dynamic text goes through textContent, never innerHTML)
   * ════════════════════════════════════════════════════════════════════ */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function setProps(el, props) {
    if (!props) return;
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  function appendKids(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false || k === '') continue;
      el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return el;
  }
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    setProps(el, props);
    return appendKids(el, kids);
  }
  function s(tag, props, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    setProps(el, props);
    return appendKids(el, kids);
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function mount(el, ...kids) { clear(el); return appendKids(el, kids); }

  function setLoading(btn, on, label) {
    if (!btn) return;
    btn.classList.toggle('is-loading', !!on);
    btn.disabled = !!on;
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
    if (label) { const l = btn.querySelector('.btn-label'); if (l) l.textContent = label; }
  }

  /* Icons (decorative) */
  const icon = {
    external: () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
      s('path', { d: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })),
    building: () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
      s('path', { d: 'M4 20V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15M15 9h4a1 1 0 0 1 1 1v10M3 20h18M8 8h3M8 12h3M8 16h3', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round' })),
    pin: () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
      s('path', { d: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7' }),
      s('circle', { cx: '12', cy: '10', r: '2.3', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7' })),
    info: () => s('svg', { viewBox: '0 0 24 24', class: 'notice-ico', 'aria-hidden': 'true', focusable: 'false' },
      s('circle', { cx: '12', cy: '12', r: '9', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7' }),
      s('path', { d: 'M12 11v6M12 7.5v.01', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' })),
    alert: () => s('svg', { viewBox: '0 0 24 24', class: 'notice-ico', 'aria-hidden': 'true', focusable: 'false' },
      s('path', { d: 'M12 3.5 2.8 19.5h18.4z', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linejoin': 'round' }),
      s('path', { d: 'M12 10v4.5M12 17v.01', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' })),
    plug: () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
      s('path', { d: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      s('path', { d: 'M4 4l16 16', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round' })),
    inbox: () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
      s('path', { d: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linejoin': 'round' })),
  };

  /* ════════════════════════════════════════════════════════════════════
   * Formatting
   * ════════════════════════════════════════════════════════════════════ */
  const nf = new Intl.NumberFormat('zh-CN');
  function fmtInt(n) { return n == null || isNaN(n) ? '—' : nf.format(Number(n)); }
  function fmtUsd(v) {
    if (v == null || v === '' || isNaN(Number(v))) return '—';
    const n = Number(v);
    if (n === 0) return '$0';
    const a = Math.abs(n);
    if (a < 0.00005) return (n < 0 ? '-' : '') + '<$0.0001';
    if (a < 0.01) return (n < 0 ? '-$' : '$') + a.toFixed(4);
    return (n < 0 ? '-$' : '$') + a.toFixed(2);
  }
  function fmtPct(part, whole) {
    if (!whole) return '—';
    const p = (Number(part) / Number(whole)) * 100;
    return (p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)) + '%';
  }
  function fmtMs(ms) {
    if (ms == null || isNaN(ms)) return '—';
    return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s';
  }
  function parseDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDateTime(iso, opts) {
    const d = parseDate(iso);
    if (!d) return '—';
    const now = new Date();
    const o = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
    if (d.getFullYear() !== now.getFullYear() || (opts && opts.year)) o.year = 'numeric';
    return new Intl.DateTimeFormat('zh-CN', o).format(d);
  }
  function fmtFull(iso) {
    const d = parseDate(iso);
    return d ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' }).format(d) : '';
  }
  function fmtRelative(iso) {
    const d = parseDate(iso);
    if (!d) return '';
    const sec = Math.round((Date.now() - d.getTime()) / 1000);
    if (sec < 45) return '刚刚';
    if (sec < 3600) return Math.round(sec / 60) + ' 分钟前';
    if (sec < 86400) return Math.round(sec / 3600) + ' 小时前';
    if (sec < 86400 * 30) return Math.round(sec / 86400) + ' 天前';
    return fmtDateTime(iso, { year: true });
  }
  function safeUrl(u) {
    if (!u || typeof u !== 'string') return null;
    let v = u.trim();
    if (/^(www\.)?linkedin\.com\//i.test(v)) v = 'https://' + v;
    try {
      const url = new URL(v);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch (_) { return null; }
  }
  function shortUrl(u) {
    return String(u || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  }
  function initials(name, email) {
    const src = (name || '').trim();
    if (src) {
      if (/[㐀-鿿]/.test(src)) return src.replace(/\s+/g, '').slice(0, 1);
      const parts = src.split(/\s+/).filter(Boolean);
      const a = parts[0] ? parts[0][0] : '';
      const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
      return (a + b).toUpperCase();
    }
    return email ? email[0].toUpperCase() : '?';
  }

  const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;
  const isEmail = (v) => EMAIL_RE.test(String(v || '').trim());

  /* ════════════════════════════════════════════════════════════════════
   * Labels
   * ════════════════════════════════════════════════════════════════════ */
  const STATUS = {
    found: { label: '已找到', tone: 'ok' },
    uncertain: { label: '待确认', tone: 'warn' },
    not_found: { label: '未找到', tone: '' },
    skipped: { label: '已跳过', tone: '' },
    error: { label: '出错', tone: 'danger' },
    pending: { label: '等待中', tone: '' },
    running: { label: '查询中', tone: 'accent' },
  };
  const CALL_STATUS = {
    hit: { label: '命中', tone: 'ok' },
    miss: { label: '未命中', tone: '' },
    skipped: { label: '跳过', tone: '' },
    error: { label: '错误', tone: 'danger' },
  };
  const SKIP_REASON = {
    free_mail_provider: '这是免费邮箱域名（如 gmail.com、qq.com），默认不进行付费查询，以免浪费额度。',
    daily_budget: '今日预算已用完，付费查询已暂停。',
    invalid_email: '邮箱地址格式无效。',
    lookup_budget: '单次查询费用上限过低，没有可执行的数据源。',
    no_steps: '服务器没有启用任何查询步骤。',
  };
  const CONFIDENCE = { exact: '邮箱精确匹配', name: '按姓名匹配', weak: '弱匹配' };
  const SOURCE = { web: '网页', gmail: 'Gmail', outlook: 'Outlook', api: 'API' };

  function badge(text, tone, extra) {
    return h('span', Object.assign({ class: 'badge' + (tone ? ' ' + tone : '') }, extra || {}), text);
  }
  function statusBadge(status) {
    const m = STATUS[status] || { label: status || '未知', tone: '' };
    return badge(m.label, m.tone);
  }
  function nameMatchBadge(r) {
    const m = r.match || {};
    if (m.nameMatched === true) return badge('姓名匹配', 'ok', { title: '提供的姓名与资料一致' });
    if (m.nameMatched === false) return badge('姓名不符', 'warn', { title: '提供的姓名与资料不一致，请人工确认' });
    return badge('未提供姓名', '', { title: '没有可用于核对的姓名' });
  }
  function skipReasonText(code) {
    if (!code) return '服务器跳过了此次查询。';
    return SKIP_REASON[code] || ('服务器跳过了此次查询（' + code + '）。');
  }

  /* ════════════════════════════════════════════════════════════════════
   * API client
   * ════════════════════════════════════════════════════════════════════ */
  class ApiError extends Error {
    constructor(kind, status, code, message) {
      super(message || code);
      this.kind = kind;       // network | timeout | aborted | auth | budget | rate | bad_request | not_found | server | parse
      this.status = status;
      this.code = code;
    }
  }

  async function api(path, opts) {
    const o = opts || {};
    const method = o.method || 'GET';
    const auth = o.auth !== false;
    const prompt = o.prompt !== false;
    let root = o.base != null ? normalizeBase(o.base) : getBaseUrl();
    if (!root && isFile) root = FILE_DEFAULT_BASE;
    const headers = { Accept: 'application/json' };
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const t = o.token != null ? o.token : getToken();
      if (!t) {
        const e = new ApiError('auth', 401, 'NO_TOKEN', '尚未设置访问令牌');
        setConn('auth');
        if (prompt) onUnauthorized(e);
        throw e;
      }
      headers.Authorization = 'Bearer ' + t;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.timeout || 60000);
    if (o.signal) {
      if (o.signal.aborted) ctrl.abort();
      else o.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
    }

    let res;
    try {
      res = await fetch(root + path, {
        method,
        headers,
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
        signal: ctrl.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch (_) {
      clearTimeout(timer);
      if (o.signal && o.signal.aborted) throw new ApiError('aborted', 0, 'ABORTED', '已取消');
      if (ctrl.signal.aborted) throw new ApiError('timeout', 0, 'TIMEOUT', '请求超时');
      if (o.base == null) setConn('down');
      throw new ApiError('network', 0, 'NETWORK', '无法连接服务器');
    }

    let data = null;
    let text = '';
    try { text = await res.text(); } catch (_) { /* ignore */ }
    clearTimeout(timer);
    if (text) { try { data = JSON.parse(text); } catch (_) { data = null; } }

    if (!res.ok || !data || data.ok === false) {
      const st = res.status;
      let kind;
      if (st === 401) kind = 'auth';
      else if (st === 402) kind = 'budget';
      else if (st === 429) kind = 'rate';
      else if (st === 400 || st === 422) kind = 'bad_request';
      else if (st === 404) kind = 'not_found';
      else if (st >= 500) kind = 'server';
      else if (!data) kind = 'parse';
      else kind = 'server';
      const e = new ApiError(kind, st, (data && data.error) || ('HTTP_' + st), (data && data.message) || '');
      if (kind === 'auth' && o.base == null && o.token == null) {
        setConn('auth');
        if (prompt) onUnauthorized(e);
      }
      throw e;
    }
    if (o.base == null && connState !== 'ok') setConn('ok');
    return data;
  }

  function describeError(err) {
    const e = err instanceof ApiError ? err : new ApiError('server', 0, 'CLIENT', (err && err.message) || String(err));
    const fromFile = isFile;
    switch (e.kind) {
      case 'network':
        return {
          title: '无法连接服务器',
          detail: '请确认 Email-Linkedin 服务器已启动，并检查「设置」中的服务器地址' +
            (getBaseUrl() ? '（当前：' + getBaseUrl() + '）' : '（当前：同源）') + '。' +
            (fromFile ? '从本地文件打开页面时，服务器还需要允许该来源的跨域请求 (CORS)；最简单的方式是直接访问服务器地址。' : ''),
          settings: true,
        };
      case 'timeout': return { title: '请求超时', detail: '服务器长时间没有响应，请稍后再试。' };
      case 'aborted': return { title: '已取消', detail: '' };
      case 'auth': return { title: '需要访问令牌', detail: e.code === 'NO_TOKEN' ? '尚未设置访问令牌。' : '令牌无效或已过期 (401)，请重新输入。', settings: true };
      case 'budget': return { title: '今日预算已用完', detail: (e.message ? e.message + '。' : '') + '付费查询将在明天 (Europe/Berlin) 恢复，或在服务器上提高 DAILY_CAP_USD。' };
      case 'rate': return { title: '请求过于频繁', detail: e.message || '请稍等片刻再试 (429)。' };
      case 'bad_request': return { title: '请求无效', detail: e.message || ('服务器拒绝了这个请求（' + e.code + '）。') };
      case 'not_found': return { title: '接口不存在 (404)', detail: '服务器地址可能有误，或服务器版本不匹配。', settings: true };
      case 'parse': return { title: '无法解析服务器响应', detail: '返回的内容不是 JSON，请检查服务器地址是否指向 Email-Linkedin 服务器。', settings: true };
      default: return { title: '服务器错误', detail: (e.message || '服务器处理请求时出错') + (e.status ? '（HTTP ' + e.status + (e.code ? ' · ' + e.code : '') + '）' : '') };
    }
  }

  function errorNotice(err, opts) {
    const d = describeError(err);
    const o = opts || {};
    const actions = [];
    if (o.retry) actions.push(h('button', { type: 'button', class: 'btn small', onclick: o.retry }, '重试'));
    if (d.settings && err && err.kind === 'auth') {
      actions.push(h('button', { type: 'button', class: 'btn small', onclick: () => openConnect() }, '输入令牌'));
    } else if (d.settings && currentRoute !== 'settings') {
      actions.push(h('a', { class: 'btn small ghost', href: '#/settings' }, '前往设置'));
    }
    return h('div', { class: 'notice danger', role: 'alert' },
      icon.alert(),
      h('div', { class: 'notice-body' },
        h('p', { class: 'notice-title' }, d.title),
        d.detail ? h('p', { class: 'small' }, d.detail) : null,
        actions.length ? h('div', { class: 'btn-group' }, actions) : null));
  }

  function stateBlock(kind, title, detail, actions) {
    return h('div', { class: 'state' + (kind === 'error' ? ' danger' : '') },
      kind === 'error' ? icon.plug() : icon.inbox(),
      h('p', { class: 'state-title' }, title),
      detail ? h('p', { class: 'small' }, detail) : null,
      actions && actions.length ? h('div', { class: 'btn-group' }, actions) : null);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Toasts
   * ════════════════════════════════════════════════════════════════════ */
  function toast(msg, tone, ms) {
    const el = h('div', { class: 'toast' + (tone ? ' ' + tone : '') }, msg);
    $('#toasts').append(el);
    setTimeout(() => { el.remove(); }, ms || 3200);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Connection status pill
   * ════════════════════════════════════════════════════════════════════ */
  let connState = 'unknown';
  let serverVersion = '';
  function setConn(state, text) {
    connState = state;
    const pill = $('#connPill');
    pill.dataset.state = state;
    const label = text || ({
      ok: serverVersion ? '已连接 · v' + serverVersion : '已连接',
      auth: '需要令牌',
      down: '无法连接服务器',
      unknown: '检查连接…',
    })[state];
    $('#connPillText').textContent = label;
    pill.setAttribute('aria-label', '连接状态：' + label + '。打开设置');
  }
  async function checkHealth() {
    setConn('unknown');
    try {
      const hres = await api('/api/health', { auth: false, timeout: 8000 });
      serverVersion = hres.version || '';
      setConn(getToken() ? 'ok' : 'auth');
      return hres;
    } catch (err) {
      setConn('down', err.kind === 'not_found' || err.kind === 'parse' ? '服务器地址有误' : null);
      return null;
    }
  }

  /* ════════════════════════════════════════════════════════════════════
   * Theme
   * ════════════════════════════════════════════════════════════════════ */
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };
  function getTheme() { const t = store.get(LS.theme); return t === 'light' || t === 'dark' ? t : 'auto'; }
  function applyTheme(mode) {
    if (mode === 'auto') { document.documentElement.removeAttribute('data-theme'); store.del(LS.theme); }
    else { document.documentElement.setAttribute('data-theme', mode); store.set(LS.theme, mode); }
    const btn = $('#themeToggle');
    btn.dataset.mode = mode;
    $('#themeLabel').textContent = THEME_LABEL[mode];
    const next = THEMES[(THEMES.indexOf(mode) + 1) % THEMES.length];
    btn.setAttribute('aria-label', '主题：' + THEME_LABEL[mode] + '。切换为' + THEME_LABEL[next]);
    btn.title = '主题：' + THEME_LABEL[mode];
    if (currentRoute === 'stats' && lastStats) renderChart();
  }

  /* ════════════════════════════════════════════════════════════════════
   * Connect dialog (token entry)
   * ════════════════════════════════════════════════════════════════════ */
  const connectDialog = $('#connectDialog');
  function openConnect(reason) {
    const reasonEl = $('#connectReason');
    if (reason) reasonEl.textContent = reason;
    else mount(reasonEl, '请输入服务器 ', h('code', null, '.env'), ' 中的 ', h('code', null, 'APP_TOKEN'), '。令牌仅保存在本浏览器。');
    $('#cnToken').value = '';
    $('#cnToken').removeAttribute('aria-invalid');
    $('#cnTokenErr').hidden = true;
    $('#cnBaseUrl').value = store.get(LS.baseUrl) || '';
    if (isFile) $('#cnBaseUrl').placeholder = '留空 = ' + FILE_DEFAULT_BASE;
    $('#cnBaseWrap').open = !!store.get(LS.baseUrl) || isFile;
    if (!connectDialog.open) connectDialog.showModal();
    setTimeout(() => $('#cnToken').focus(), 30);
  }
  function onUnauthorized(err) {
    if (currentRoute === 'settings') return; // the token field is already on screen
    if (connectDialog.open) {
      showConnectError(err.code === 'NO_TOKEN' ? '请输入访问令牌。' : '令牌无效 (401)。');
      return;
    }
    openConnect(err.code === 'NO_TOKEN' ? '请输入访问令牌以继续。令牌仅保存在本浏览器。' : '令牌无效或已过期 (401)，请重新输入。');
  }
  function showConnectError(msg) {
    const e = $('#cnTokenErr');
    e.textContent = msg;
    e.hidden = false;
    $('#cnToken').setAttribute('aria-invalid', 'true');
  }

  function initConnect() {
    $('#cnCancel').addEventListener('click', () => connectDialog.close());
    $('#connectForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const token = $('#cnToken').value.trim();
      const base = normalizeBase($('#cnBaseUrl').value);
      if (!token) { showConnectError('请输入访问令牌。'); $('#cnToken').focus(); return; }
      if (!isValidBase(base)) { showConnectError('服务器地址必须以 http:// 或 https:// 开头。'); $('#cnBaseWrap').open = true; $('#cnBaseUrl').focus(); return; }
      const btn = $('#cnSubmit');
      setLoading(btn, true);
      $('#cnTokenErr').hidden = true;
      try {
        await api('/api/steps', { base, token, prompt: false, timeout: 10000 });
        store.set(LS.token, token);
        if (base) store.set(LS.baseUrl, base); else store.del(LS.baseUrl);
        $('#cnToken').value = '';
        connectDialog.close();
        toast('已连接服务器', 'ok');
        checkHealth();
        refreshView();
      } catch (err) {
        if (err.kind === 'auth') showConnectError('令牌无效，服务器拒绝了它 (401)。');
        else {
          const d = describeError(err);
          showConnectError(d.title + (d.detail ? '：' + d.detail : ''));
        }
      } finally {
        setLoading(btn, false);
      }
    });
  }

  /* ════════════════════════════════════════════════════════════════════
   * Result card
   * ════════════════════════════════════════════════════════════════════ */
  function traceTable(cost) {
    const calls = (cost && Array.isArray(cost.calls)) ? cost.calls : [];
    const total = cost && cost.usd != null ? cost.usd : calls.reduce((a, c) => a + (Number(c.usd) || 0), 0);
    const head = h('div', { class: 'trace-head' },
      h('p', { class: 'section-label', style: 'margin:0' }, '调用记录'),
      h('p', { class: 'small' }, '本次费用 ', h('span', { class: 'trace-total' }, fmtUsd(total))));
    if (!calls.length) return h('div', { class: 'trace' }, head, h('p', { class: 'small muted' }, '没有调用任何数据源。'));
    return h('div', { class: 'trace' }, head,
      h('div', { class: 'table-wrap' },
        h('table', { class: 'table compact responsive' },
          h('caption', { class: 'visually-hidden' }, '每个步骤的调用记录'),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, '步骤'),
            h('th', { scope: 'col' }, '数据源'),
            h('th', { scope: 'col' }, '结果'),
            h('th', { scope: 'col', class: 'num' }, '费用'),
            h('th', { scope: 'col', class: 'num' }, '耗时'))),
          h('tbody', null, calls.map((c) => {
            const cs = CALL_STATUS[c.status] || { label: c.status || '—', tone: '' };
            return h('tr', null,
              h('td', { 'data-label': '步骤', class: 'mono' }, c.step || '—'),
              h('td', { 'data-label': '数据源', class: 'mono break small' }, c.provider || '—'),
              h('td', { 'data-label': '结果' }, badge(cs.label, cs.tone)),
              h('td', { 'data-label': '费用', class: 'num' }, fmtUsd(c.usd)),
              h('td', { 'data-label': '耗时', class: 'num muted' }, fmtMs(c.ms)));
          })))));
  }

  /**
   * @param {object} r lookup response
   * @param {{onForce?:Function, onRequery?:Function, forceLabel?:string}} opts
   */
  function renderResult(r, opts) {
    const o = opts || {};
    const status = r.status || 'not_found';
    const p = r.profile || null;
    const m = r.match || {};
    const hasProfile = !!(p && (p.linkedinUrl || p.fullName));
    const li = p ? safeUrl(p.linkedinUrl) : null;
    const displayName = (p && p.fullName) || m.nameGiven || r.email;
    const headline = p ? (p.headline || [p.title, p.company].filter(Boolean).join(' · ')) : '';

    // Badges
    const badges = [statusBadge(status)];
    if (hasProfile) badges.push(nameMatchBadge(r));
    if (r.cached) badges.push(badge('缓存', 'accent plain', { title: r.lookedUpAt ? '查询于 ' + fmtFull(r.lookedUpAt) : '来自缓存' }));
    if (r.source && SOURCE[r.source]) badges.push(badge('来源：' + SOURCE[r.source], 'plain'));

    // Meta line
    const meta = [];
    if (p && p.company) meta.push(h('span', null, icon.building(), p.company + (p.companyDomain ? ' · ' + p.companyDomain : '')));
    if (p && p.location) meta.push(h('span', null, icon.pin(), p.location));

    const top = h('div', { class: 'result-top' },
      h('div', { class: 'avatar', 'aria-hidden': 'true' }, hasProfile ? initials(p.fullName, r.email) : '?'),
      h('div', { class: 'result-id' },
        h('h2', { class: 'result-name' }, displayName),
        headline ? h('p', { class: 'result-headline' }, headline) : null,
        meta.length ? h('p', { class: 'result-meta' }, meta) : null,
        displayName !== r.email ? h('p', { class: 'result-email' }, r.email) : null));

    const body = [top, h('div', { class: 'badges' }, badges)];

    if (li) {
      body.push(h('a', { class: 'li-link', href: li, target: '_blank', rel: 'noopener noreferrer' },
        h('span', null, shortUrl(li)), icon.external(), h('span', { class: 'visually-hidden' }, '（在新标签页打开）')));
    }

    // Provider / confidence line
    if (m.provider || m.confidence || r.lookedUpAt) {
      body.push(h('dl', { class: 'kv small' },
        m.provider ? [h('dt', null, '数据来源'), h('dd', { class: 'mono break' }, m.provider)] : null,
        m.confidence ? [h('dt', null, '置信度'), h('dd', null, CONFIDENCE[m.confidence] || m.confidence)] : null,
        m.nameGiven ? [h('dt', null, '提供的姓名'), h('dd', null, m.nameGiven)] : null,
        r.lookedUpAt ? [h('dt', null, r.cached ? '缓存时间' : '查询时间'), h('dd', { title: fmtFull(r.lookedUpAt) }, fmtRelative(r.lookedUpAt))] : null));
    }

    // Status-specific notices
    if (status === 'skipped') {
      const actions = [];
      if (o.onForce && r.skippedReason !== 'invalid_email') {
        actions.push(h('button', { type: 'button', class: 'btn small primary', onclick: (ev) => o.onForce(ev.currentTarget) },
          h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'btn-label' }, '仍然查询')));
      }
      body.push(h('div', { class: 'notice' }, icon.info(),
        h('div', { class: 'notice-body' },
          h('p', { class: 'notice-title' }, '已跳过，未产生费用'),
          h('p', { class: 'small' }, skipReasonText(r.skippedReason)),
          actions.length ? [h('p', { class: 'small muted' }, '「仍然查询」会忽略此规则并调用付费数据源。'), h('div', { class: 'btn-group' }, actions)] : null)));
    } else if (status === 'not_found') {
      const actions = [];
      if (o.onForce && r.cached) {
        actions.push(h('button', { type: 'button', class: 'btn small', onclick: (ev) => o.onForce(ev.currentTarget) },
          h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'btn-label' }, '忽略缓存重新查询')));
      }
      const tried = (r.cost && r.cost.calls || []).filter((c) => c.status !== 'skipped').length;
      body.push(h('div', { class: 'notice' }, icon.info(),
        h('div', { class: 'notice-body' },
          h('p', { class: 'notice-title' }, '未找到 LinkedIn 主页'),
          h('p', { class: 'small' }, (tried ? '已尝试 ' + tried + ' 个步骤，均未命中。' : '') + '可以补充发件人姓名，或粘贴邮件签名后重试。'),
          actions.length ? h('div', { class: 'btn-group' }, actions) : null)));
    } else if (status === 'uncertain') {
      body.push(h('div', { class: 'notice warn' }, icon.alert(),
        h('div', { class: 'notice-body' },
          h('p', { class: 'notice-title' }, '结果待确认'),
          h('p', { class: 'small' },
            m.nameGiven && p && p.fullName
              ? '数据源返回的姓名是「' + p.fullName + '」，与提供的「' + m.nameGiven + '」不一致，请人工核对。'
              : '数据源返回了资料，但姓名无法与邮件中的姓名对应，请人工核对。'))));
    }

    // Positions
    const positions = p && Array.isArray(p.positions) ? p.positions.filter((x) => x && (x.title || x.company)) : [];
    if (positions.length) {
      body.push(h('div', null,
        h('p', { class: 'section-label' }, '工作经历'),
        h('ul', { class: 'positions' }, positions.slice(0, 8).map((x) =>
          h('li', null,
            h('span', { class: 'pos-main' }, x.title || '—', x.company ? h('span', { class: 'pos-company' }, ' · ' + x.company) : null),
            x.current ? badge('当前', 'ok plain') : null)))));
    }

    body.push(traceTable(r.cost));

    if (o.onRequery) {
      body.push(h('div', { class: 'btn-group' },
        h('button', { type: 'button', class: 'btn small', onclick: (ev) => o.onRequery(ev.currentTarget) },
          h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'btn-label' }, '删除缓存并重新查询'))));
    }

    return h('article', { class: 'result', 'data-status': status, 'aria-label': '查询结果：' + r.email },
      h('div', { class: 'result-accent' }),
      h('div', { class: 'result-body' }, body));
  }

  function skeletonResult() {
    return h('div', { class: 'result', 'aria-hidden': 'true' },
      h('div', { class: 'result-accent' }),
      h('div', { class: 'skeleton-card' },
        h('div', { class: 'skeleton', style: 'width:42%;height:20px' }),
        h('div', { class: 'skeleton', style: 'width:68%' }),
        h('div', { class: 'skeleton', style: 'width:30%' }),
        h('div', { class: 'skeleton', style: 'width:100%;height:60px;margin-top:8px' })));
  }

  /* ════════════════════════════════════════════════════════════════════
   * View: 查询
   * ════════════════════════════════════════════════════════════════════ */
  let lookupBusy = false;
  function initLookup() {
    const form = $('#lookupForm');
    const emailEl = $('#lkEmail');
    const errEl = $('#lkEmailErr');
    const region = $('#lookupResult');

    emailEl.addEventListener('input', () => {
      if (emailEl.getAttribute('aria-invalid') === 'true' && isEmail(emailEl.value)) {
        emailEl.removeAttribute('aria-invalid');
        errEl.hidden = true;
      }
    });

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (lookupBusy) return;
      const email = emailEl.value.trim();
      if (!isEmail(email)) {
        errEl.textContent = email ? '邮箱格式不正确。' : '请输入邮箱地址。';
        errEl.hidden = false;
        emailEl.setAttribute('aria-invalid', 'true');
        emailEl.focus();
        return;
      }
      const body = { email, source: 'web' };
      const name = $('#lkName').value.trim();
      const domain = $('#lkDomain').value.trim();
      const signature = $('#lkSignature').value.trim();
      const maxUsd = $('#lkMaxUsd').value.trim();
      if (name) body.name = name;
      if (domain) body.domain = domain.replace(/^@/, '');
      if (signature) body.signature = signature;
      if ($('#lkForce').checked) body.force = true;
      if (maxUsd !== '' && !isNaN(Number(maxUsd)) && Number(maxUsd) >= 0) body.maxUsd = Number(maxUsd);
      runLookup(body, $('#lkSubmit'));
    });

    async function runLookup(body, btn) {
      lookupBusy = true;
      setLoading($('#lkSubmit'), true, '查询中…');
      if (btn && btn !== $('#lkSubmit')) setLoading(btn, true);
      region.setAttribute('aria-busy', 'true');
      mount(region, skeletonResult(), h('p', { class: 'visually-hidden' }, '正在查询 ' + body.email + '…'));
      try {
        const r = await api('/api/lookup', { method: 'POST', body, timeout: 120000 });
        mount(region, renderResult(r, {
          onForce: (b) => runLookup(Object.assign({}, body, { force: true }), b),
        }));
        if (r.status === 'found') toast('已找到 ' + ((r.profile && r.profile.fullName) || r.email), 'ok', 2400);
      } catch (err) {
        mount(region, errorNotice(err, { retry: () => runLookup(body) }));
      } finally {
        lookupBusy = false;
        region.setAttribute('aria-busy', 'false');
        setLoading($('#lkSubmit'), false, '查询');
      }
    }
  }

  function prefillLookup(params) {
    if (!params) return;
    const email = params.get('email');
    const name = params.get('name');
    if (email) $('#lkEmail').value = email;
    if (name) $('#lkName').value = name;
  }

  /* ════════════════════════════════════════════════════════════════════
   * View: 批量
   * ════════════════════════════════════════════════════════════════════ */
  const BATCH_MAX = 50;
  const BATCH_CHUNK = 5; // items per /api/lookup/batch request → progress granularity
  let batchRows = [];
  let batchRunning = false;
  let batchAbort = null;

  function parseBatch(text) {
    const items = [];
    const invalid = [];
    const seen = new Set();
    let dupes = 0;
    const lines = String(text || '').split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      let email = '';
      let name = '';
      const angle = line.match(/^(.*?)<\s*(?:mailto:)?([^<>\s]+)\s*>\s*,?\s*$/i);
      if (angle) {
        email = angle[2];
        name = angle[1].trim().replace(/^["']|["']$/g, '').replace(/,\s*$/, '').trim();
      } else {
        const parts = line.split(/[,;\t]/).map((x) => x.trim().replace(/^["']|["']$/g, '').trim()).filter(Boolean);
        const idx = parts.findIndex((x) => isEmail(x.replace(/^mailto:/i, '')));
        if (idx >= 0) {
          email = parts[idx].replace(/^mailto:/i, '');
          name = parts.filter((_, j) => j !== idx).join(' ').trim();
        } else {
          // "Jane Doe jane@acme.com" (space separated)
          const sp = line.split(/\s+/);
          const j = sp.findIndex((x) => isEmail(x));
          if (j >= 0) { email = sp[j]; name = sp.filter((_, k) => k !== j).join(' '); }
        }
      }
      email = email.trim();
      if (!isEmail(email)) { invalid.push(i + 1); return; }
      const key = email.toLowerCase();
      if (seen.has(key)) { dupes++; return; }
      seen.add(key);
      items.push({ email, name: name || '' });
    });
    return { items, invalid, dupes };
  }

  function updateBatchInfo() {
    if (batchRunning) return;
    const { items, invalid, dupes } = parseBatch($('#batchInput').value);
    const info = $('#batchParseInfo');
    const btn = $('#batchSubmit');
    const n = items.length;
    if (!n && !invalid.length) {
      info.textContent = '尚未输入。';
      info.className = 'hint';
    } else {
      const parts = ['已识别 ' + n + ' 条'];
      if (invalid.length) parts.push(invalid.length + ' 行无法识别（第 ' + invalid.slice(0, 6).join('、') + (invalid.length > 6 ? ' …' : '') + ' 行）');
      if (dupes) parts.push('已去除 ' + dupes + ' 条重复');
      if (n > BATCH_MAX) parts.push('超过单次上限 ' + BATCH_MAX + ' 条，本次只查询前 ' + BATCH_MAX + ' 条');
      info.textContent = parts.join('，') + '。';
      info.className = n > BATCH_MAX || invalid.length ? 'hint field-error' : 'hint';
    }
    btn.disabled = n === 0;
    btn.querySelector('.btn-label').textContent = n ? '开始查询（' + Math.min(n, BATCH_MAX) + ' 条）' : '开始查询';
  }

  function batchRowEl(row, i) {
    const r = row.result;
    const p = r && r.profile;
    const li = p ? safeUrl(p.linkedinUrl) : null;
    const st = row.state === 'done' ? (r.status || 'not_found') : row.state;
    const statusCell = h('td', { 'data-label': '状态' }, statusBadge(st));
    if (row.state === 'done' && r.status === 'skipped' && r.skippedReason) {
      const short = { free_mail_provider: '免费邮箱', daily_budget: '今日预算已用完', invalid_email: '邮箱无效', lookup_budget: '单次上限过低' };
      statusCell.append(h('span', { class: 'cell-sub', title: skipReasonText(r.skippedReason) }, short[r.skippedReason] || r.skippedReason));
    }
    if (row.state === 'error' && row.error) {
      statusCell.append(h('span', { class: 'cell-sub' }, describeError(row.error).title));
    }
    let action = null;
    if (!batchRunning) {
      if (row.state === 'error') action = h('button', { type: 'button', class: 'btn small', onclick: (ev) => rerunBatchRow(i, false, ev.currentTarget) }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'btn-label' }, '重试'));
      else if (row.state === 'done' && r.status === 'skipped' && r.skippedReason !== 'invalid_email') action = h('button', { type: 'button', class: 'btn small', onclick: (ev) => rerunBatchRow(i, true, ev.currentTarget) }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'btn-label' }, '仍然查询'));
    }
    return h('tr', { class: row.state === 'pending' ? 'is-pending' : row.state === 'running' ? 'is-running' : null },
      h('td', { 'data-label': '#', class: 'muted num' }, String(i + 1)),
      h('td', { 'data-label': '邮箱' },
        r ? h('button', { type: 'button', class: 'row-btn', title: '查看详情', onclick: () => openDetail(r) }, row.email) : h('span', { class: 'cell-email' }, row.email),
        row.name ? h('span', { class: 'cell-sub' }, row.name) : null),
      statusCell,
      h('td', { 'data-label': 'LinkedIn', class: 'break' }, li ? h('a', { href: li, target: '_blank', rel: 'noopener noreferrer' }, shortUrl(li).replace(/^linkedin\.com/i, '')) : h('span', { class: 'muted' }, '—')),
      h('td', { 'data-label': '姓名' }, (p && p.fullName) || h('span', { class: 'muted' }, '—')),
      h('td', { 'data-label': '公司' }, (p && p.company) || h('span', { class: 'muted' }, '—')),
      h('td', { 'data-label': '费用', class: 'num' }, r ? fmtUsd(r.cost && r.cost.usd) : '—'),
      h('td', { 'data-label': '' }, action));
  }

  function renderBatch() {
    const body = $('#batchBody');
    mount(body, batchRows.map(batchRowEl));
    const done = batchRows.filter((r) => r.state === 'done' || r.state === 'error').length;
    const found = batchRows.filter((r) => r.result && r.result.status === 'found').length;
    const uncertain = batchRows.filter((r) => r.result && r.result.status === 'uncertain').length;
    const errors = batchRows.filter((r) => r.state === 'error').length;
    const usd = batchRows.reduce((a, r) => a + (r.result && r.result.cost ? Number(r.result.cost.usd) || 0 : 0), 0);
    const total = batchRows.length;
    $('#batchSummary').textContent = '找到 ' + found + ' / ' + total +
      (uncertain ? ' · 待确认 ' + uncertain : '') + (errors ? ' · 出错 ' + errors : '') + ' · 费用 ' + fmtUsd(usd);
    $('#batchProgressFill').style.width = total ? (done / total * 100) + '%' : '0';
    $('#batchProgressText').textContent = batchRunning ? '正在查询… 已完成 ' + done + ' / ' + total : '已完成 ' + done + ' / ' + total;
    $('#batchExport').disabled = batchRunning || done === 0;
  }

  async function runBatch(items) {
    batchRunning = true;
    batchAbort = new AbortController();
    batchRows = items.map((it) => ({ email: it.email, name: it.name, state: 'pending', result: null, error: null }));
    $('#batchResultsCard').hidden = false;
    $('#batchProgressWrap').hidden = false;
    $('#batchInput').disabled = true;
    $('#batchClear').disabled = true;
    $('#batchCancel').hidden = false;
    setLoading($('#batchSubmit'), true, '查询中…');
    renderBatch();

    let stopErr = null;
    for (let i = 0; i < batchRows.length; i += BATCH_CHUNK) {
      if (batchAbort.signal.aborted) break;
      const chunk = batchRows.slice(i, i + BATCH_CHUNK);
      chunk.forEach((r) => { r.state = 'running'; });
      renderBatch();
      try {
        const res = await api('/api/lookup/batch', {
          method: 'POST',
          body: { items: chunk.map((r) => (r.name ? { email: r.email, name: r.name, source: 'web' } : { email: r.email, source: 'web' })) },
          timeout: 60000 * chunk.length,
          signal: batchAbort.signal,
        });
        const results = Array.isArray(res.results) ? res.results : [];
        const byEmail = new Map();
        results.forEach((x) => { if (x && x.email) byEmail.set(String(x.email).toLowerCase(), x); });
        chunk.forEach((row, j) => {
          const x = byEmail.get(row.email.toLowerCase()) || results[j];
          if (!x) { row.state = 'error'; row.error = new ApiError('server', 0, 'NO_RESULT', '服务器没有返回该条结果'); }
          else if (x.ok === false) { row.state = 'error'; row.error = new ApiError(x.error === 'BUDGET_EXHAUSTED' || x.error === 'DAILY_BUDGET' ? 'budget' : 'server', 0, x.error || 'ERROR', x.message || ''); }
          else { row.state = 'done'; row.result = x; }
        });
      } catch (err) {
        chunk.forEach((row) => { row.state = err.kind === 'aborted' ? 'pending' : 'error'; row.error = err.kind === 'aborted' ? null : err; });
        if (err.kind === 'aborted' || err.kind === 'auth' || err.kind === 'budget' || err.kind === 'network' || err.kind === 'rate') {
          if (err.kind !== 'aborted') stopErr = err;
          break;
        }
      }
      renderBatch();
    }

    // Anything left untouched after a stop.
    batchRows.forEach((row) => {
      if (row.state === 'running' || row.state === 'pending') {
        if (stopErr) { row.state = 'error'; row.error = stopErr; }
        else { row.state = 'error'; row.error = new ApiError('aborted', 0, 'ABORTED', '已停止'); }
      }
    });

    batchRunning = false;
    batchAbort = null;
    $('#batchInput').disabled = false;
    $('#batchClear').disabled = false;
    $('#batchCancel').hidden = true;
    setLoading($('#batchSubmit'), false);
    updateBatchInfo();
    renderBatch();
    if (stopErr) {
      const d = describeError(stopErr);
      toast('批量查询已中止：' + d.title, 'danger', 5000);
    } else {
      const found = batchRows.filter((r) => r.result && r.result.status === 'found').length;
      toast('批量查询完成：找到 ' + found + ' / ' + batchRows.length, 'ok');
    }
  }

  async function rerunBatchRow(i, force, btn) {
    const row = batchRows[i];
    if (!row || batchRunning) return;
    setLoading(btn, true);
    const body = { email: row.email, source: 'web' };
    if (row.name) body.name = row.name;
    if (force) body.force = true;
    try {
      row.result = await api('/api/lookup', { method: 'POST', body, timeout: 120000 });
      row.state = 'done';
      row.error = null;
    } catch (err) {
      row.state = 'error';
      row.error = err;
      toast(describeError(err).title, 'danger');
    }
    renderBatch();
  }

  function csvCell(v) {
    let s2 = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s2)) s2 = "'" + s2; // prevent formula injection in spreadsheets
    return /[",\r\n]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2;
  }
  function exportBatchCsv() {
    const header = ['email', 'name_given', 'status', 'linkedin_url', 'full_name', 'headline', 'title', 'company', 'company_domain', 'location', 'provider', 'name_matched', 'confidence', 'cached', 'usd', 'skipped_reason', 'error', 'looked_up_at'];
    const lines = [header.join(',')];
    batchRows.forEach((row) => {
      const r = row.result || {};
      const p = r.profile || {};
      const m = r.match || {};
      lines.push([
        row.email, row.name, row.state === 'error' ? 'error' : (r.status || row.state),
        p.linkedinUrl, p.fullName, p.headline, p.title, p.company, p.companyDomain, p.location,
        m.provider, m.nameMatched == null ? '' : String(m.nameMatched), m.confidence,
        r.cached == null ? '' : String(!!r.cached),
        r.cost && r.cost.usd != null ? Number(r.cost.usd).toFixed(6) : '',
        r.skippedReason, row.error ? (row.error.code || '') + (row.error.message ? ' ' + row.error.message : '') : '',
        r.lookedUpAt,
      ].map(csvCell).join(','));
    });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = 'email-linkedin-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.csv';
    const a = h('a', { href: URL.createObjectURL(blob), download: name, hidden: true });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function initBatch() {
    const input = $('#batchInput');
    let t;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(updateBatchInfo, 150); });
    $('#batchClear').addEventListener('click', () => { input.value = ''; updateBatchInfo(); input.focus(); });
    $('#batchCancel').addEventListener('click', () => { if (batchAbort) batchAbort.abort(); });
    $('#batchExport').addEventListener('click', exportBatchCsv);
    $('#batchForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (batchRunning) return;
      const { items } = parseBatch(input.value);
      if (!items.length) return;
      runBatch(items.slice(0, BATCH_MAX));
    });
    updateBatchInfo();
  }

  /* ════════════════════════════════════════════════════════════════════
   * View: 历史
   * ════════════════════════════════════════════════════════════════════ */
  const hist = { limit: 25, offset: 0, q: '', status: '', total: 0, items: [], req: 0, loaded: false };

  function historyRowEl(item) {
    const p = item.profile || {};
    const m = item.match || {};
    const tr = h('tr', null,
      h('td', { 'data-label': '时间', class: 'nowrap', title: fmtFull(item.lookedUpAt) }, fmtDateTime(item.lookedUpAt)),
      h('td', { 'data-label': '邮箱' }, h('button', { type: 'button', class: 'row-btn', 'aria-label': '查看 ' + item.email + ' 的详情' }, item.email)),
      h('td', { 'data-label': '姓名' }, p.fullName || m.nameGiven || h('span', { class: 'muted' }, '—')),
      h('td', { 'data-label': '公司' }, p.company || h('span', { class: 'muted' }, '—')),
      h('td', { 'data-label': '状态' }, statusBadge(item.status), item.cached ? h('span', { class: 'cell-sub' }, '缓存') : null),
      h('td', { 'data-label': '来源', class: 'muted' }, SOURCE[item.source] || item.source || '—'),
      h('td', { 'data-label': '费用', class: 'num' }, fmtUsd(item.cost && item.cost.usd)),
      h('td', { 'data-label': '' },
        h('button', { type: 'button', class: 'btn small', 'data-act': 'requery', 'aria-label': '删除缓存并重新查询 ' + item.email },
          h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'btn-label' }, '重新查询'))));
    tr.addEventListener('click', (ev) => {
      const actBtn = ev.target.closest('[data-act="requery"]');
      if (actBtn) { ev.stopPropagation(); requery(item, actBtn); return; }
      if (ev.target.closest('a')) return;
      openDetail(item, { requery: true });
    });
    return tr;
  }

  async function loadHistory() {
    const reqId = ++hist.req;
    const bodyEl = $('#historyBody');
    const stateEl = $('#historyState');
    clear(stateEl);
    if (!hist.loaded) {
      mount(bodyEl, [0, 1, 2, 3].map(() => h('tr', { 'aria-hidden': 'true' },
        h('td', { colspan: '8' }, h('div', { class: 'skeleton', style: 'height:18px' })))));
    } else {
      bodyEl.style.opacity = '.55';
    }
    const qs = new URLSearchParams({ limit: String(hist.limit), offset: String(hist.offset) });
    if (hist.q) qs.set('q', hist.q);
    if (hist.status) qs.set('status', hist.status);
    try {
      const res = await api('/api/lookups?' + qs.toString());
      if (reqId !== hist.req) return;
      hist.loaded = true;
      hist.total = Number(res.total) || 0;
      hist.items = Array.isArray(res.items) ? res.items : [];
      if (!hist.items.length && hist.offset > 0 && hist.total > 0) {
        hist.offset = Math.max(0, Math.floor((hist.total - 1) / hist.limit) * hist.limit);
        return loadHistory();
      }
      if (!hist.items.length) {
        mount(bodyEl, h('tr', null, h('td', { colspan: '8', class: 'table-empty' },
          hist.q || hist.status ? '没有符合条件的记录。' : '暂无查询记录。去「查询」页试试吧。')));
      } else {
        mount(bodyEl, hist.items.map(historyRowEl));
      }
      const pages = Math.max(1, Math.ceil(hist.total / hist.limit));
      const page = Math.floor(hist.offset / hist.limit) + 1;
      $('#historyPager').hidden = hist.total <= hist.limit;
      $('#histPageInfo').textContent = '第 ' + page + ' / ' + pages + ' 页 · 共 ' + fmtInt(hist.total) + ' 条';
      $('#histPrev').disabled = hist.offset <= 0;
      $('#histNext').disabled = hist.offset + hist.limit >= hist.total;
    } catch (err) {
      if (reqId !== hist.req) return;
      clear(bodyEl);
      $('#historyPager').hidden = true;
      mount(stateEl, errorNotice(err, { retry: loadHistory }));
    } finally {
      if (reqId === hist.req) bodyEl.style.opacity = '';
    }
  }

  async function requery(item, btn) {
    const ok = window.confirm('将删除 ' + item.email + ' 的缓存结果并重新查询，可能产生费用。继续？');
    if (!ok) return;
    setLoading(btn, true);
    try {
      await api('/api/lookups/' + encodeURIComponent(item.email), { method: 'DELETE' });
      const body = { email: item.email, source: 'web' };
      const nameGiven = item.match && item.match.nameGiven;
      if (nameGiven) body.name = nameGiven;
      const r = await api('/api/lookup', { method: 'POST', body, timeout: 120000 });
      toast('已重新查询 ' + item.email, 'ok');
      openDetail(r, { requery: true });
      if (currentRoute === 'history') loadHistory();
    } catch (err) {
      const d = describeError(err);
      toast(d.title + (d.detail && err.kind !== 'network' ? '：' + d.detail : ''), 'danger', 5000);
      if (currentRoute === 'history') loadHistory();
    } finally {
      if (btn.isConnected) setLoading(btn, false);
    }
  }

  function initHistory() {
    let t;
    $('#histQ').addEventListener('input', (ev) => {
      clearTimeout(t);
      t = setTimeout(() => { hist.q = ev.target.value.trim(); hist.offset = 0; loadHistory(); }, 300);
    });
    $('#histStatus').addEventListener('change', (ev) => { hist.status = ev.target.value; hist.offset = 0; loadHistory(); });
    $('#histRefresh').addEventListener('click', loadHistory);
    $('#histPrev').addEventListener('click', () => { hist.offset = Math.max(0, hist.offset - hist.limit); loadHistory(); });
    $('#histNext').addEventListener('click', () => { hist.offset += hist.limit; loadHistory(); });
  }

  /* ════════════════════════════════════════════════════════════════════
   * Detail dialog
   * ════════════════════════════════════════════════════════════════════ */
  const detailDialog = $('#detailDialog');
  function openDetail(r, opts) {
    const o = opts || {};
    $('#detailTitle').textContent = '查询详情';
    const body = { email: r.email, source: 'web' };
    if (r.match && r.match.nameGiven) body.name = r.match.nameGiven;
    mount($('#detailBody'), renderResult(r, {
      onForce: async (btn) => {
        setLoading(btn, true);
        try {
          const nr = await api('/api/lookup', { method: 'POST', body: Object.assign({}, body, { force: true }), timeout: 120000 });
          openDetail(nr, o);
          if (currentRoute === 'history') loadHistory();
        } catch (err) {
          setLoading(btn, false);
          $('#detailBody').prepend(errorNotice(err));
        }
      },
      onRequery: o.requery ? (btn) => requery(r, btn) : null,
    }));
    if (!detailDialog.open) detailDialog.showModal();
    detailDialog.scrollTop = 0;
  }
  function initDetail() {
    $('#detailClose').addEventListener('click', () => detailDialog.close());
    detailDialog.addEventListener('click', (ev) => { if (ev.target === detailDialog) detailDialog.close(); });
  }

  /* ════════════════════════════════════════════════════════════════════
   * View: 用量
   * ════════════════════════════════════════════════════════════════════ */
  let lastStats = null;
  let chartMetric = 'lookups';
  let chartActive = -1;
  let chartResize = null;
  const METRIC = {
    lookups: { label: '查询数', fmt: fmtInt },
    found: { label: '找到', fmt: fmtInt },
    usd: { label: '费用', fmt: fmtUsd },
  };

  function berlinToday() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  }
  function last30(daily) {
    const map = new Map();
    (daily || []).forEach((d) => { if (d && d.day) map.set(String(d.day).slice(0, 10), d); });
    let end = berlinToday();
    for (const k of map.keys()) if (k > end) end = k;
    const out = [];
    const [y, mo, da] = end.split('-').map(Number);
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(Date.UTC(y, mo - 1, da - i));
      const key = dt.toISOString().slice(0, 10);
      const d = map.get(key) || {};
      out.push({ day: key, lookups: Number(d.lookups) || 0, found: Number(d.found) || 0, usd: Number(d.usd) || 0 });
    }
    return out;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const nf2 = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nf2 * exp;
  }
  function tickFmt(v, metric) {
    if (metric === 'usd') {
      if (v === 0) return '$0';
      return v < 0.01 ? '$' + v.toFixed(4).replace(/0+$/, '') : v < 1 ? '$' + v.toFixed(2) : '$' + (Math.round(v * 10) / 10);
    }
    return v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'K' : String(Math.round(v * 10) / 10);
  }
  function shortDay(day) { return day.slice(5).replace('-', '/'); }

  function tile(label, b) {
    const x = b || {};
    return h('section', { class: 'card tile', 'aria-label': label },
      h('p', { class: 'tile-label' }, label),
      h('p', { class: 'tile-hero' }, fmtInt(x.lookups), h('small', null, '次查询')),
      h('dl', { class: 'tile-rows' },
        h('div', null, h('dt', null, '找到'), h('dd', null, fmtInt(x.found))),
        h('div', null, h('dt', null, '命中率'), h('dd', null, fmtPct(x.found, x.lookups))),
        h('div', null, h('dt', null, '费用'), h('dd', null, fmtUsd(x.usd)))));
  }

  function budgetCard(b) {
    const x = b || {};
    const cap = Number(x.dailyCapUsd);
    const spent = Number(x.spentTodayUsd) || 0;
    const ratio = cap > 0 ? spent / cap : (spent > 0 ? 1 : 0);
    const level = cap <= 0 || ratio >= 1 ? 'danger' : ratio >= 0.75 ? 'warn' : 'ok';
    const pct = Math.min(100, Math.round(ratio * 1000) / 10);
    const fill = h('div', { class: 'meter-fill', 'data-level': level });
    fill.style.width = (cap > 0 ? pct : 100) + '%';
    return h('section', { class: 'card budget', 'aria-labelledby': 'budgetTitle' },
      h('div', { class: 'budget-top' },
        h('h2', { id: 'budgetTitle' }, '今日预算'),
        h('p', { class: 'budget-figure' }, fmtUsd(spent), h('span', null, ' / ' + (cap > 0 ? fmtUsd(cap) : '—')))),
      h('div', { class: 'meter-track', 'data-level': level, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(cap > 0 ? cap : 0), 'aria-valuenow': String(spent), 'aria-valuetext': '已用 ' + fmtUsd(spent) + (cap > 0 ? '，上限 ' + fmtUsd(cap) + '（' + pct + '%）' : '，付费查询已禁用'), 'aria-label': '今日预算使用情况' }, fill),
      h('p', { class: 'small muted' },
        cap > 0
          ? (ratio >= 1 ? '今日预算已用完，付费查询暂停至明天 (Europe/Berlin)。' : '剩余 ' + fmtUsd(Math.max(0, cap - spent)) + '（已用 ' + pct + '%）。')
          : 'DAILY_CAP_USD 为 0，所有付费查询均已禁用。',
        x.lookupMaxUsd != null ? ' 单次查询上限 ' + fmtUsd(x.lookupMaxUsd) + '。' : ''));
  }

  function providersCard(list) {
    const rows = Array.isArray(list) ? list.slice() : [];
    rows.sort((a, b) => (Number(b.usd) || 0) - (Number(a.usd) || 0) || (Number(b.calls) || 0) - (Number(a.calls) || 0));
    return h('section', { class: 'card', 'aria-labelledby': 'provTitle' },
      h('div', { class: 'card-head' }, h('h2', { id: 'provTitle' }, '数据源'), h('span', { class: 'small muted' }, '累计')),
      rows.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'table responsive' },
          h('caption', { class: 'visually-hidden' }, '各数据源的调用次数、命中与费用'),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, '数据源'),
            h('th', { scope: 'col', class: 'num' }, '调用'),
            h('th', { scope: 'col', class: 'num' }, '命中'),
            h('th', { scope: 'col', class: 'num' }, '命中率'),
            h('th', { scope: 'col', class: 'num' }, '费用'))),
          h('tbody', null, rows.map((p) => h('tr', null,
            h('td', { 'data-label': '数据源', class: 'mono break small' }, p.provider || '—'),
            h('td', { 'data-label': '调用', class: 'num' }, fmtInt(p.calls)),
            h('td', { 'data-label': '命中', class: 'num' }, fmtInt(p.hits)),
            h('td', { 'data-label': '命中率', class: 'num' }, fmtPct(p.hits, p.calls)),
            h('td', { 'data-label': '费用', class: 'num' }, fmtUsd(p.usd)))))))
        : h('p', { class: 'muted small' }, '还没有任何数据源调用。'));
  }

  function chartCard() {
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '图表指标' },
      Object.keys(METRIC).map((k) => h('button', {
        type: 'button', 'aria-pressed': String(k === chartMetric), 'data-metric': k,
        onclick: (ev) => {
          chartMetric = k;
          seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.metric === k)));
          renderChart();
          ev.currentTarget.focus();
        },
      }, METRIC[k].label)));
    return h('section', { class: 'card', 'aria-labelledby': 'chartTitle' },
      h('div', { class: 'chart-head' },
        h('div', null, h('h2', { id: 'chartTitle' }, '近 30 天'), h('p', { class: 'small muted', id: 'chartSub' }, '')),
        seg),
      h('div', { class: 'chart', id: 'chart' }),
      h('details', { class: 'chart-table' }, h('summary', null, '查看数据表'), h('div', { class: 'table-wrap', id: 'chartTable' })));
  }

  function renderChart() {
    const host = $('#chart');
    if (!host || !lastStats) return;
    const data = last30(lastStats.daily);
    const metric = chartMetric;
    const vals = data.map((d) => d[metric]);
    const total = vals.reduce((a, b) => a + b, 0);
    const sub = $('#chartSub');
    if (sub) sub.textContent = METRIC[metric].label + '（每日）· 合计 ' + METRIC[metric].fmt(total);

    const W = Math.max(280, Math.floor(host.clientWidth || 640));
    const H = W < 480 ? 180 : 220;
    const padL = metric === 'usd' ? 52 : 36;
    const padR = 6, padT = 12, padB = 26;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const max = niceMax(Math.max.apply(null, vals));
    const band = plotW / data.length;
    const barW = Math.max(2, Math.min(24, band - 2));
    const y = (v) => padT + plotH - (v / max) * plotH;

    const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
    const grid = s('g', { class: 'grid' }, ticks.map((t) => s('line', { x1: padL, x2: W - padR, y1: y(t).toFixed(1), y2: y(t).toFixed(1) })));
    const yAxis = s('g', { class: 'axis' }, ticks.map((t) => s('text', { x: padL - 6, y: (y(t) + 3.5).toFixed(1), 'text-anchor': 'end' }, tickFmt(t, metric))));
    const step = W < 420 ? 7 : W < 640 ? 5 : 3;
    const xAxis = s('g', { class: 'axis' }, data.map((d, i) => {
      if ((data.length - 1 - i) % step !== 0) return null;
      return s('text', { x: (padL + band * i + band / 2).toFixed(1), y: H - 8, 'text-anchor': 'middle' }, shortDay(d.day));
    }));

    const bars = s('g', null, data.map((d, i) => {
      const v = d[metric];
      const x = padL + band * i + (band - barW) / 2;
      if (v <= 0) {
        return s('rect', { class: 'bar zero', x: x.toFixed(1), y: (padT + plotH - 1).toFixed(1), width: barW.toFixed(1), height: '1', 'data-i': i });
      }
      const top = y(v);
      const hgt = Math.max(2, padT + plotH - top);
      const r = Math.min(4, barW / 2, hgt);
      const yt = padT + plotH - hgt;
      const x1 = x, x2 = x + barW, yb = padT + plotH;
      const dPath = 'M' + x1.toFixed(1) + ',' + yb.toFixed(1) +
        'V' + (yt + r).toFixed(1) +
        'Q' + x1.toFixed(1) + ',' + yt.toFixed(1) + ' ' + (x1 + r).toFixed(1) + ',' + yt.toFixed(1) +
        'H' + (x2 - r).toFixed(1) +
        'Q' + x2.toFixed(1) + ',' + yt.toFixed(1) + ' ' + x2.toFixed(1) + ',' + (yt + r).toFixed(1) +
        'V' + yb.toFixed(1) + 'Z';
      return s('path', { class: 'bar', d: dPath, 'data-i': i });
    }));
    const baseline = s('line', { x1: padL, x2: W - padR, y1: padT + plotH, y2: padT + plotH, stroke: 'var(--border-strong)', 'stroke-width': '1' });
    const hits = s('g', null, data.map((d, i) => s('rect', { class: 'hit', x: (padL + band * i).toFixed(1), y: padT, width: band.toFixed(1), height: plotH + padB, 'data-i': i })));

    const svg = s('svg', {
      width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', tabindex: '0',
      'aria-label': '近 30 天每日' + METRIC[metric].label + '柱状图，合计 ' + METRIC[metric].fmt(total) + '。使用左右方向键逐日查看。',
    }, grid, baseline, bars, yAxis, xAxis, hits);

    const tip = $('#chartTip');
    function show(i, anchor) {
      chartActive = i;
      host.classList.add('hovering');
      bars.querySelectorAll('.bar').forEach((b) => b.classList.toggle('active', Number(b.dataset.i) === i));
      const d = data[i];
      mount(tip,
        h('strong', null, METRIC[metric].fmt(d[metric])),
        h('div', { class: 'tip-row' }, h('span', { class: 'tip-key', 'aria-hidden': 'true' }), METRIC[metric].label + ' · ' + d.day),
        h('div', { class: 'tip-row muted small' }, '查询 ' + fmtInt(d.lookups) + ' · 找到 ' + fmtInt(d.found) + ' · ' + fmtUsd(d.usd)));
      tip.hidden = false;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + (padL + band * i + band / 2) * (rect.width / W);
      const cy = anchor != null ? anchor : rect.top + y(d[metric]) * (rect.height / H);
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = cx - tw / 2;
      left = Math.max(8, Math.min(window.innerWidth - tw - 8, left));
      let top = cy - th - 12;
      if (top < 8) top = cy + 16;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }
    function hide() {
      chartActive = -1;
      host.classList.remove('hovering');
      bars.querySelectorAll('.bar.active').forEach((b) => b.classList.remove('active'));
      tip.hidden = true;
    }
    const onPointer = (ev) => {
      const i = Number(ev.target.dataset && ev.target.dataset.i);
      if (!isNaN(i)) show(i);
    };
    hits.addEventListener('pointermove', onPointer);
    hits.addEventListener('pointerdown', onPointer);
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('blur', hide);
    svg.addEventListener('focus', () => { if (chartActive < 0) show(data.length - 1); });
    svg.addEventListener('keydown', (ev) => {
      let i = chartActive < 0 ? data.length - 1 : chartActive;
      if (ev.key === 'ArrowLeft') i = Math.max(0, i - 1);
      else if (ev.key === 'ArrowRight') i = Math.min(data.length - 1, i + 1);
      else if (ev.key === 'Home') i = 0;
      else if (ev.key === 'End') i = data.length - 1;
      else if (ev.key === 'Escape') { hide(); return; }
      else return;
      ev.preventDefault();
      show(i);
    });
    mount(host, svg);
    tip.hidden = true;

    // Accessible table view (newest first)
    const tbl = $('#chartTable');
    if (tbl) {
      mount(tbl, h('table', { class: 'table compact' },
        h('caption', { class: 'visually-hidden' }, '近 30 天每日数据'),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, '日期'), h('th', { scope: 'col', class: 'num' }, '查询'),
          h('th', { scope: 'col', class: 'num' }, '找到'), h('th', { scope: 'col', class: 'num' }, '命中率'),
          h('th', { scope: 'col', class: 'num' }, '费用'))),
        h('tbody', null, data.slice().reverse().map((d) => h('tr', null,
          h('td', { class: 'nowrap' }, d.day), h('td', { class: 'num' }, fmtInt(d.lookups)),
          h('td', { class: 'num' }, fmtInt(d.found)), h('td', { class: 'num' }, fmtPct(d.found, d.lookups)),
          h('td', { class: 'num' }, fmtUsd(d.usd)))))));
    }
  }

  async function loadStats() {
    const root = $('#statsRoot');
    const btn = $('#statsRefresh');
    if (!lastStats) {
      mount(root, h('div', { class: 'stats-grid', 'aria-hidden': 'true' }, [0, 1, 2].map(() =>
        h('div', { class: 'card skeleton-card' }, h('div', { class: 'skeleton', style: 'width:40%' }), h('div', { class: 'skeleton', style: 'width:60%;height:28px' }), h('div', { class: 'skeleton', style: 'height:36px' })))));
    }
    setLoading(btn, true);
    try {
      const st = await api('/api/stats');
      lastStats = st;
      mount(root,
        h('div', { class: 'stats-grid' }, tile('今日', st.today), tile('本月', st.month), tile('累计', st.allTime)),
        budgetCard(st.budget),
        chartCard(),
        providersCard(st.providers));
      root.style.display = 'flex';
      root.style.flexDirection = 'column';
      root.style.gap = '14px';
      renderChart();
      if (!chartResize && 'ResizeObserver' in window) {
        let raf = 0;
        let lastW = 0;
        chartResize = new ResizeObserver((entries) => {
          const w = Math.floor(entries[0].contentRect.width);
          if (w === lastW) return;
          lastW = w;
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => { if (currentRoute === 'stats') renderChart(); });
        });
      }
      if (chartResize) { chartResize.disconnect(); chartResize.observe($('#chart')); }
    } catch (err) {
      lastStats = null;
      mount(root, errorNotice(err, { retry: loadStats }));
    } finally {
      setLoading(btn, false);
    }
  }

  /* ════════════════════════════════════════════════════════════════════
   * View: 设置
   * ════════════════════════════════════════════════════════════════════ */
  function fillSettings() {
    $('#setBaseUrl').value = store.get(LS.baseUrl) || '';
    if (isFile) $('#setBaseUrl').placeholder = '留空 = ' + FILE_DEFAULT_BASE;
    const t = getToken();
    const tokenEl = $('#setToken');
    tokenEl.value = '';
    tokenEl.placeholder = t ? maskToken(t) : '粘贴 APP_TOKEN';
    $('#setTokenHint').textContent = t
      ? '已保存令牌（' + maskToken(t) + '）。输入新令牌可替换。'
      : '尚未设置令牌。在服务器 .env 的 APP_TOKEN 中可以找到。';
    $('#setTokenClear').hidden = !t;
  }

  function providerBadges(map) {
    const keys = Object.keys(map || {});
    if (!keys.length) return h('span', { class: 'muted small' }, '—');
    return h('div', { class: 'badges' }, keys.map((k) => badge(k + (map[k] ? ' · 可用' : ' · 未配置'), map[k] ? 'ok' : '', { title: map[k] ? k + ' 已配置 API key' : k + ' 未配置 API key' })));
  }

  function stepsTable(steps) {
    if (!steps.length) return h('p', { class: 'muted small' }, '没有配置任何步骤。');
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table responsive' },
      h('caption', { class: 'visually-hidden' }, '查询步骤（按执行顺序）'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', class: 'num' }, '#'),
        h('th', { scope: 'col' }, '步骤'),
        h('th', { scope: 'col' }, '数据源'),
        h('th', { scope: 'col' }, '需要'),
        h('th', { scope: 'col', class: 'num' }, '单次上限'),
        h('th', { scope: 'col' }, '状态'))),
      h('tbody', null, steps.map((st, i) => h('tr', null,
        h('td', { 'data-label': '#', class: 'num muted' }, String(i + 1)),
        h('td', { 'data-label': '步骤' }, h('span', null, st.label || st.id), st.label && st.id ? h('span', { class: 'cell-sub mono' }, st.id) : null),
        h('td', { 'data-label': '数据源', class: 'mono break small' }, st.provider || '—'),
        h('td', { 'data-label': '需要' }, (st.needs || []).map((n) => (n === 'email' ? '邮箱' : n === 'name' ? '姓名' : n)).join(' + ') || '—'),
        h('td', { 'data-label': '单次上限', class: 'num' }, st.maxUsd != null ? fmtUsd(st.maxUsd) : '—'),
        h('td', { 'data-label': '状态' }, st.enabled === false ? badge('停用', '') : badge('启用', 'ok')))))));
  }

  async function testConnection() {
    const btn = $('#setTest');
    const diag = $('#settingsDiag');
    const base = normalizeBase($('#setBaseUrl').value);
    if (!isValidBase(base)) {
      mount(diag, errorNotice(new ApiError('bad_request', 0, 'BAD_URL', '服务器地址必须以 http:// 或 https:// 开头。')));
      return;
    }
    const token = $('#setToken').value.trim() || getToken();
    setLoading(btn, true, '测试中…');
    mount(diag, h('div', { class: 'card skeleton-card', 'aria-hidden': 'true' }, h('div', { class: 'skeleton', style: 'width:30%' }), h('div', { class: 'skeleton', style: 'width:70%' })));
    const parts = [];
    let health = null;
    try {
      health = await api('/api/health', { auth: false, base, timeout: 8000 });
      parts.push(h('section', { class: 'card diag', 'aria-labelledby': 'diagTitle' },
        h('div', { class: 'card-head', style: 'margin:0' }, h('h2', { id: 'diagTitle' }, '服务器'), badge('连接正常', 'ok')),
        h('dl', { class: 'kv' },
          h('dt', null, '地址'), h('dd', { class: 'mono break' }, base || (isFile ? FILE_DEFAULT_BASE : location.origin)),
          h('dt', null, '版本'), h('dd', null, health.version || '—'),
          h('dt', null, '数据源'), h('dd', null, providerBadges(health.providers)),
          Array.isArray(health.steps) && health.steps.length ? [h('dt', null, '步骤顺序'), h('dd', { class: 'mono small break' }, health.steps.join(' → '))] : null)));
      if (!base || base === getBaseUrl()) { serverVersion = health.version || ''; }
    } catch (err) {
      parts.push(errorNotice(err));
    }

    if (health) {
      if (!token) {
        parts.push(h('div', { class: 'notice warn' }, icon.alert(), h('div', { class: 'notice-body' },
          h('p', { class: 'notice-title' }, '尚未设置令牌'), h('p', { class: 'small' }, '服务器可以访问，但其他接口需要访问令牌。'))));
      } else {
        try {
          const st = await api('/api/steps', { base, token, prompt: false, timeout: 10000 });
          parts.push(h('section', { class: 'card', 'aria-labelledby': 'stepsTitle' },
            h('div', { class: 'card-head' }, h('h2', { id: 'stepsTitle' }, '查询步骤'), badge('令牌有效', 'ok')),
            h('p', { class: 'small muted', style: 'margin-bottom:10px' }, '按顺序执行，命中即停止；成本低的步骤在前。'),
            stepsTable(Array.isArray(st.steps) ? st.steps : [])));
        } catch (err) {
          if (err.kind === 'auth') {
            parts.push(h('div', { class: 'notice danger', role: 'alert' }, icon.alert(), h('div', { class: 'notice-body' },
              h('p', { class: 'notice-title' }, '令牌无效 (401)'), h('p', { class: 'small' }, '服务器拒绝了这个令牌，请检查 .env 中的 APP_TOKEN。'))));
          } else parts.push(errorNotice(err));
        }
      }
    }
    mount(diag, h('div', { class: 'diag' }, parts));
    setLoading(btn, false, '测试连接');
    if (base === getBaseUrl()) {
      if (!health) setConn('down');
      else checkHealth();
    }
  }

  function initSettings() {
    $('#settingsForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const base = normalizeBase($('#setBaseUrl').value);
      const msg = $('#settingsSaved');
      if (!isValidBase(base)) {
        $('#setBaseUrl').setAttribute('aria-invalid', 'true');
        msg.textContent = '服务器地址必须以 http:// 或 https:// 开头。';
        msg.className = 'small field-error';
        $('#setBaseUrl').focus();
        return;
      }
      $('#setBaseUrl').removeAttribute('aria-invalid');
      if (base) store.set(LS.baseUrl, base); else store.del(LS.baseUrl);
      const token = $('#setToken').value.trim();
      if (token) store.set(LS.token, token);
      fillSettings();
      msg.textContent = '已保存。';
      msg.className = 'small';
      setTimeout(() => { if (msg.textContent === '已保存。') msg.textContent = ''; }, 2500);
      hist.loaded = false;
      lastStats = null;
      checkHealth();
    });
    $('#setTokenClear').addEventListener('click', () => {
      if (!window.confirm('清除本浏览器中保存的访问令牌？')) return;
      store.del(LS.token);
      fillSettings();
      setConn('auth');
      toast('令牌已清除');
    });
    $('#setTest').addEventListener('click', testConnection);
  }

  /* ════════════════════════════════════════════════════════════════════
   * Router
   * ════════════════════════════════════════════════════════════════════ */
  const ROUTES = { lookup: '查询', batch: '批量', history: '历史', stats: '用量', settings: '设置' };
  let currentRoute = '';

  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const [path, query] = raw.split('?');
    const name = ROUTES[path] ? path : 'lookup';
    return { name, params: new URLSearchParams(query || '') };
  }

  function route(initial) {
    const { name, params } = parseHash();
    const changed = name !== currentRoute;
    currentRoute = name;
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== name; });
    document.querySelectorAll('.sidenav a').forEach((a) => {
      if (a.dataset.route === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = ROUTES[name] + ' · Email → LinkedIn';
    if (name === 'lookup') prefillLookup(params);
    if (changed) {
      loadView(name);
      if (!initial) {
        const h1 = document.querySelector('#view-' + name + ' h1');
        if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
        window.scrollTo(0, 0);
      }
    }
    $('#chartTip').hidden = true;
  }

  function loadView(name) {
    if (name === 'history') loadHistory();
    else if (name === 'stats') loadStats();
    else if (name === 'settings') fillSettings();
  }
  function refreshView() { loadView(currentRoute); }

  /* ════════════════════════════════════════════════════════════════════
   * Boot
   * ════════════════════════════════════════════════════════════════════ */
  function boot() {
    applyTheme(getTheme());
    $('#themeToggle').addEventListener('click', () => {
      const cur = getTheme();
      applyTheme(THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]);
    });
    $('#connPill').addEventListener('click', () => {
      if (connState === 'auth' && currentRoute !== 'settings') openConnect();
      else location.hash = '#/settings';
    });

    initConnect();
    initDetail();
    initLookup();
    initBatch();
    initHistory();
    initSettings();

    window.addEventListener('hashchange', () => route(false));
    window.addEventListener('scroll', () => { const t = $('#chartTip'); if (t && !t.hidden) t.hidden = true; }, { passive: true });
    route(true);

    checkHealth().then((health) => {
      if (!getToken()) {
        setConn(health ? 'auth' : 'down');
        if (currentRoute !== 'settings') {
          openConnect(health
            ? '首次使用：请输入服务器 .env 中的 APP_TOKEN。令牌仅保存在本浏览器。'
            : '暂时无法连接服务器。请输入访问令牌，必要时在下方填写服务器地址。');
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
