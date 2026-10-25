'use strict';
// Shared card renderer for Gmail and Outlook. Lives in a shadow root so the mail client's CSS cannot leak in.
(function () {
  const STYLE = `
    :host { all: initial; display: block; font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2937; margin: 6px 0 8px; }
    .card { border: 1px solid #e5e7eb; border-left: 3px solid #c7d2fe; border-radius: 8px; padding: 8px 12px; background: #fff; max-width: 560px; }
    .card.found { border-left-color: #16a34a; } .card.uncertain { border-left-color: #d97706; } .card.not_found, .card.skipped { border-left-color: #9ca3af; } .card.error { border-left-color: #dc2626; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .brand { font-size: 11px; color: #6b7280; letter-spacing: .02em; }
    button { all: initial; cursor: pointer; font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 6px; background: #4f46e5; color: #fff; }
    button.ghost { background: transparent; color: #4f46e5; border: 1px solid #c7d2fe; }
    button:disabled { opacity: .6; cursor: default; }
    a { color: #0a66c2; font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .name { font-weight: 600; font-size: 14px; }
    .muted { color: #6b7280; font-size: 12px; }
    .badge { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: #f3f4f6; color: #374151; }
    .badge.ok { background: #dcfce7; color: #166534; } .badge.warn { background: #fef3c7; color: #92400e; } .badge.err { background: #fee2e2; color: #991b1b; }
    .pos { margin: 4px 0 0; padding-left: 14px; font-size: 12px; color: #374151; } .pos li { margin: 1px 0; }
    .foot { margin-top: 4px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .spin { display: inline-block; width: 12px; height: 12px; border: 2px solid #c7d2fe; border-top-color: #4f46e5; border-radius: 50%; animation: s .8s linear infinite; }
    @keyframes s { to { transform: rotate(360deg); } }
    @media (prefers-color-scheme: dark) { :host { color: #e5e7eb; } .card { background: #111827; border-color: #374151; } .muted, .brand { color: #9ca3af; } .badge { background: #1f2937; color: #d1d5db; } .pos { color: #d1d5db; } }
  `;
  const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v != null) el.setAttribute(k, v); } for (const k of kids) if (k != null) el.append(k); return el; };
  const usd = n => (n == null ? '' : n === 0 ? '$0' : n < 0.01 ? '$' + n.toFixed(4) : '$' + n.toFixed(2));

  // Creates the host element. api = { lookup({force}) }, ctx = { email, name, autoLookup, showCost }
  function createCard(ctx, api) {
    const host = h('div', { 'data-el-card': ctx.email });
    const root = host.attachShadow({ mode: 'open' });
    root.append(h('style', {}, STYLE));
    const box = h('div', { class: 'card' });
    root.append(box);
    let busy = false;

    function render(state) {
      box.replaceChildren();
      box.className = 'card ' + (state.kind || '');
      const brand = h('span', { class: 'brand' }, 'LinkedIn');
      if (state.kind === 'idle') {
        box.append(h('div', { class: 'row' }, brand, h('span', { class: 'muted' }, ctx.email), h('button', { onclick: () => run(false) }, '查 LinkedIn')));
      } else if (state.kind === 'loading') {
        box.append(h('div', { class: 'row' }, brand, h('span', { class: 'spin' }), h('span', { class: 'muted' }, '正在查找 ' + ctx.email + ' …')));
      } else if (state.kind === 'error') {
        box.append(h('div', { class: 'row' }, brand, h('span', { class: 'badge err' }, state.error || '出错'), h('span', { class: 'muted' }, state.message || ''), h('button', { class: 'ghost', onclick: () => run(false) }, '重试')));
      } else {
        const r = state.result;
        const p = r.profile;
        if (r.status === 'found' || r.status === 'uncertain') {
          const badge = r.match && r.match.nameMatched === true ? h('span', { class: 'badge ok' }, '姓名匹配') : r.match && r.match.nameMatched === false ? h('span', { class: 'badge warn' }, '姓名不符，请核对') : h('span', { class: 'badge' }, r.match && r.match.step === 'signature' ? '来自邮件签名' : '按邮箱匹配');
          box.append(h('div', { class: 'row' }, brand, h('a', { href: p.linkedinUrl, target: '_blank', rel: 'noopener noreferrer' }, p.fullName || p.linkedinUrl.replace('https://www.linkedin.com/in/', '')), badge, r.cached ? h('span', { class: 'badge' }, '缓存') : null));
          const line = [p.title || p.headline, p.company, p.location].filter(Boolean).join(' · ');
          if (line) box.append(h('div', { class: 'muted' }, line));
          if (r.status === 'uncertain' && r.match && r.match.nameGiven) box.append(h('div', { class: 'muted' }, '邮件显示名：' + r.match.nameGiven + '，资料姓名：' + (p.fullName || '未知')));
          const pos = (p.positions || []).filter(x => x.current && (x.title || x.company)).slice(0, 2);
          if (pos.length > 1) box.append(h('ul', { class: 'pos' }, ...pos.map(x => h('li', {}, [x.title, x.company].filter(Boolean).join(' @ ')))));
        } else if (r.status === 'skipped') {
          const why = { free_mail_provider: '个人邮箱域名，默认不查', role_address: '公共/职能邮箱，默认不查' }[r.skippedReason] || ('已跳过：' + (r.skippedReason || ''));
          box.append(h('div', { class: 'row' }, brand, h('span', { class: 'muted' }, why), h('button', { class: 'ghost', onclick: () => run(true) }, '仍然查询')));
        } else {
          box.append(h('div', { class: 'row' }, brand, h('span', { class: 'muted' }, '未找到 ' + ctx.email + ' 的 LinkedIn 资料'), r.cached ? h('span', { class: 'badge' }, '缓存') : null, h('button', { class: 'ghost', onclick: () => run(true) }, '重新查询')));
        }
        const foot = h('div', { class: 'foot' });
        if (r.match && r.match.provider) foot.append(h('span', { class: 'muted' }, '来源：' + r.match.provider.replace(/^[a-z]+:/, '')));
        if (ctx.showCost !== false && r.cost) foot.append(h('span', { class: 'muted' }, '费用：' + usd(r.cost.usd)));
        if (foot.childElementCount) box.append(foot);
      }
    }
    async function run(force) {
      if (busy) return;
      busy = true; render({ kind: 'loading' });
      try {
        const r = await api.lookup({ force });
        if (!r || r.ok === false) render({ kind: 'error', error: r && r.error === 'NO_TOKEN' ? '未设置' : r && r.error === 'UNREACHABLE' ? '无法连接' : r && r.error === 'UNAUTHORIZED' ? '令牌无效' : (r && r.error) || '出错', message: (r && r.message) || '' });
        else render({ kind: r.status, result: r });
      } catch (e) { render({ kind: 'error', error: '出错', message: String(e && e.message || e) }); }
      finally { busy = false; }
    }
    render({ kind: 'idle' });
    if (ctx.autoLookup) run(false);
    return host;
  }

  window.__elCard = { createCard };
})();
