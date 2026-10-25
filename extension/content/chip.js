'use strict';
// Sender mark for Gmail and Outlook: a small SenderFinder chip (magnifier glyph) next to the sender's name. It is inline and 18 px high,
// lives in a shadow root and never touches the mail client's layout. Clicking it opens the extension's side panel.
(function () {
  const STYLE = `
    :host { all: initial; display: inline-block; vertical-align: middle; margin-left: 6px; line-height: 0; }
    button { all: initial; cursor: pointer; position: relative; display: inline-flex; align-items: center; gap: 5px; height: 18px; padding: 0 6px 0 5px; border-radius: 3px; border: 1px solid #b8bcc6; background: transparent; color: #4b4f58; font: 700 10px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; letter-spacing: .02em; }
    button:hover { border-color: #4b4f58; } button:focus-visible { outline: 2px solid #2f55c9; outline-offset: 1px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: #b8bcc6; }
    .dot.found { background: #1d7a46; } .dot.uncertain { background: #b8860b; } .dot.error { background: #b4232c; }
    .dot.pending { background: transparent; border: 1px solid #4b4f58; width: 4px; height: 4px; }
    .tip { position: absolute; top: 22px; left: 0; z-index: 2147483647; background: #1f2937; color: #f9fafb; font: 400 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; padding: 6px 9px; border-radius: 6px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
  `;
  function createChip({ email, title }, onClick) {
    const host = document.createElement('span'); host.setAttribute('data-el-chip', email);
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = STYLE;
    const btn = document.createElement('button'); btn.type = 'button'; btn.title = title || 'SenderFinder'; btn.setAttribute('aria-label', title || 'SenderFinder');
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); label.setAttribute('viewBox', '0 0 12 12'); label.setAttribute('width', '10'); label.setAttribute('height', '10'); label.setAttribute('aria-hidden', 'true');
    label.innerHTML = '<circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.8 7.8L11 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
    const dot = document.createElement('span'); dot.className = 'dot';
    btn.append(label, dot); root.append(style, btn);
    // Gmail collapses the message when its header is clicked: keep our clicks to ourselves.
    for (const ev of ['mousedown', 'mouseup', 'pointerdown', 'pointerup']) btn.addEventListener(ev, e => e.stopPropagation());
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (onClick) onClick(); });
    let tipTimer = null;
    return {
      host,
      setStatus(s) { dot.className = 'dot' + (s ? ' ' + s : ''); },
      hint(text) {
        clearTimeout(tipTimer); root.querySelectorAll('.tip').forEach(x => x.remove());
        if (!text) return;
        const tip = document.createElement('span'); tip.className = 'tip'; tip.textContent = text; btn.append(tip);
        tipTimer = setTimeout(() => tip.remove(), 4000);
      },
    };
  }
  window.__elChip = { createChip };
})();
