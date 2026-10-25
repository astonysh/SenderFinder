'use strict';
// Injected (chrome.scripting.executeScript) into a LinkedIn profile tab that the extension opened after the
// user clicked "Connect" in the side panel. It does NOT click Connect: LinkedIn ignores scripted clicks on it and
// the profile layout changes often. The user clicks "Connect" and "Add a note"; the moment the note box appears
// the prepared note is filled in. The user reviews it and presses "Send" themselves. Nothing is read from the
// page beyond the invitation dialog.
(function () {
  if (window.__elConnectRan) return; window.__elConnectRan = true;
  const t = (k, subs) => (chrome.i18n && chrome.i18n.getMessage(k, subs == null ? undefined : [String(subs)])) || k;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const txt = el => (el && (el.getAttribute('aria-label') || el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
  // offsetParent is null for position:fixed (LinkedIn's modals), so measure boxes instead.
  const visible = el => !!(el && !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');

  const CONNECT = /^(connect|建立联系|建立人脉|加为好友|vernetzen|se connecter|conectar|connetti|verbinden|つながる|連絡を取る|1촌 맺기|连接)$/i;
  const INVITE_ARIA = /^(invite .* to connect|邀请.*建立联系|邀请.*加入.*人脉|.*zum vernetzen einladen|inviter .* à se connecter|invitar a .* a conectar)/i;
  const MORE = /^(more|more actions|更多|更多操作|mehr|plus|más|altro)$/i;
  const ADD_NOTE = /^(add a (free )?note|add note|添加备注|添加附言|添加留言|notiz hinzufügen|ajouter une note|añadir una nota|aggiungi una nota)$/i;
  const PENDING = /^(pending|待处理|已发送邀请|ausstehend|en attente|pendiente)$/i;
  const LIMIT = /(no (free )?personali[sz]ed invitations|reached (your|the) (monthly )?limit|个性化邀请|本月.*(已用完|上限)|keine .*persönlichen einladungen)/i;

  // ── Banner in a shadow root at the top of the page ──
  let bannerBox = null;
  function debugInfo() {
    const desc = el => ({ tag: el.tagName.toLowerCase(), text: txt(el).slice(0, 60), aria: (el.getAttribute('aria-label') || '').slice(0, 80), cls: (el.className && String(el.className) || '').slice(0, 120), id: el.id || '', role: el.getAttribute('role') || '', inShadowHost: !!el.shadowRoot });
    const btns = [...scope().querySelectorAll('button, a[role="button"], div[role="button"], [role="button"]')].filter(visible).slice(0, 60).map(desc);
    const customs = [...scope().querySelectorAll('*')].filter(el => el.tagName.includes('-') && visible(el) && /connect|invite/i.test(txt(el) + (el.getAttribute('aria-label') || ''))).slice(0, 20).map(desc);
    const dialogs = deepQueryAll(DIALOG_SEL).map(el => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 120), role: el.getAttribute('role') || '', visible: visible(el), inShadow: el.getRootNode() !== document, text: (el.innerText || '').slice(0, 120) }));
    const textareas = deepQueryAll('textarea').map(ta => ({ id: ta.id, name: ta.name, maxlength: ta.getAttribute('maxlength'), placeholder: (ta.placeholder || '').slice(0, 60), aria: (ta.getAttribute('aria-label') || '').slice(0, 60), visible: visible(ta), inShadow: ta.getRootNode() !== document }));
    const shadowHosts = deepQueryAll('*').filter(el => el.shadowRoot).length;
    return JSON.stringify({ url: location.pathname, readyState: document.readyState, h1: txt(document.querySelector('h1')), shadowHosts, textareas, dialogs, buttons: btns, customElements: customs }, null, 1);
  }
  let noteToCopy = '';
  function banner(kind, message, { debug = false, note = '' } = {}) {
    if (note) noteToCopy = note;
    if (!bannerBox) {
      const host = document.createElement('div'); host.setAttribute('data-el-connect-banner', '');
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host { all: initial; position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
        .b { display: flex; align-items: center; gap: 10px; padding: 9px 14px; background: #1f2937; color: #f9fafb; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
        .b.ok { background: #14532d; } .b.warn { background: #78350f; } .b.err { background: #7f1d1d; }
        .brand { font-weight: 600; white-space: nowrap; } .msg { flex: 1; min-width: 0; }
        button { all: initial; cursor: pointer; font: inherit; color: #f9fafb; opacity: .85; padding: 2px 8px; border: 1px solid rgba(255,255,255,.4); border-radius: 4px; } button:hover { opacity: 1; } button[hidden] { display: none; }
      </style><div class="b"><span class="brand">SenderFinder</span><span class="msg"></span><button type="button" class="copy" hidden></button><button type="button" class="dbg" hidden></button><button type="button" class="close"></button></div>`;
      root.querySelector('button.close').textContent = t('li_close');
      root.querySelector('button.close').addEventListener('click', () => host.remove());
      const cp = root.querySelector('button.copy'); cp.textContent = t('li_copy_note');
      cp.addEventListener('click', async () => { try { await navigator.clipboard.writeText(noteToCopy); cp.textContent = t('li_copied'); } catch (_) { cp.textContent = t('err_generic'); } setTimeout(() => { cp.textContent = t('li_copy_note'); }, 2500); });
      const dbg = root.querySelector('button.dbg'); dbg.textContent = t('li_copy_debug');
      dbg.addEventListener('click', async () => { try { await navigator.clipboard.writeText(debugInfo()); dbg.textContent = t('li_copied'); } catch (_) { dbg.textContent = t('err_generic'); } setTimeout(() => { dbg.textContent = t('li_copy_debug'); }, 2500); });
      document.documentElement.append(host);
      bannerBox = root.querySelector('.b');
    }
    bannerBox.className = 'b ' + kind;
    bannerBox.querySelector('.msg').textContent = message;
    bannerBox.querySelector('button.dbg').hidden = !debug;
    bannerBox.querySelector('button.copy').hidden = !noteToCopy;
  }

  // ── Finders ──
  const scope = () => document.querySelector('main') || document.body;
  const notInDialog = el => !el.closest('[role="dialog"], .artdeco-modal');
  const findPending = () => [...scope().querySelectorAll('button')].filter(visible).filter(notInDialog).find(el => PENDING.test(txt(el))) || null;
  // Evidence that the invitation went out: a "Pending" control anywhere (LinkedIn may tuck it into the "More" menu),
  // a "withdraw invitation" label, or the "Invitation sent" toast.
  const SENT_ARIA = /^pending\b|withdraw.*invitation|invitation.*withdraw|撤回.*邀请|邀请待处理/i;
  const SENT_TOAST = /invitation sent|your invitation .* was sent|邀请已发送|已发送邀请|einladung (wurde )?gesendet|invitation envoyée|invitación enviada/i;
  const SEND = /^(send|send now|send invitation|send without a note|发送|立即发送|发送邀请|senden|envoyer|enviar|invia)$/i;
  const sentEvidence = () => !!findPending()
    || deepQueryAll('[aria-label]').some(el => SENT_ARIA.test(el.getAttribute('aria-label') || ''))
    || deepQueryAll('[role="menuitem"], [role="button"], button').some(el => PENDING.test(txt(el)))
    || deepQueryAll('[role="alert"], [role="status"], .artdeco-toast-item, [class*="toast"]').some(el => SENT_TOAST.test(el.innerText || el.textContent || ''));
  let invitedReported = false;
  const reportInvited = () => { if (invitedReported) return; invitedReported = true; try { chrome.runtime.sendMessage({ type: 'li:invited' }); } catch (_) {} };
  // The user pressing Send in the invitation dialog is the clearest signal of all.
  document.addEventListener('click', e => {
    const b = e.composedPath().find(n => n instanceof Element && (n.tagName === 'BUTTON' || n.getAttribute('role') === 'button'));
    if (b && SEND.test(txt(b)) && b.closest(DIALOG_SEL)) setTimeout(reportInvited, 800);
  }, true);
  // querySelectorAll that also looks inside open shadow roots (LinkedIn's newer UI renders dialogs in web components).
  function deepQueryAll(sel, root = document, out = []) {
    for (const el of root.querySelectorAll(sel)) out.push(el);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.shadowRoot) deepQueryAll(sel, n.shadowRoot, out);
    return out;
  }
  const DIALOG_SEL = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open], .artdeco-modal, [data-test-modal], [data-test-modal-container], [class*="modal"], [class*="sheet"]';
  const DIALOG_TEXT = /connect|invit|note|邀请|备注|附言|einlad|notiz|inviter|invitar/i;
  const dialog = () => deepQueryAll(DIALOG_SEL).filter(visible).find(el => DIALOG_TEXT.test(el.innerText || '') || el.querySelector('textarea')) || null;
  // The invitation note box, wherever LinkedIn puts it: a visible textarea with LinkedIn's 300-character limit, or one
  // whose own labels / surrounding dialog talk about an invitation or note. (The profile page has no other textarea.)
  function noteBox() {
    for (const ta of deepQueryAll('textarea')) {
      if (!visible(ta) || ta.readOnly) continue;
      const own = [ta.id, ta.name, ta.placeholder, ta.getAttribute('aria-label'), ta.getAttribute('aria-describedby')].join(' ');
      const dlg = ta.closest(DIALOG_SEL);
      if (Number(ta.getAttribute('maxlength')) === 300 || /note|message|custom|invit|备注|附言|邀请/i.test(own) || (dlg && DIALOG_TEXT.test(dlg.innerText || ''))) return ta;
    }
    return null;
  }
  // Click the way a person would: the full pointer sequence, so handlers bound to pointer/mouse events fire too.
  function humanClick(el) {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    for (const [T, type] of [[PointerEvent, 'pointerover'], [MouseEvent, 'mouseover'], [PointerEvent, 'pointerdown'], [MouseEvent, 'mousedown']]) { try { el.dispatchEvent(new T(type, o)); } catch (_) {} }
    try { el.focus({ preventScroll: true }); } catch (_) {}
    for (const [T, type] of [[PointerEvent, 'pointerup'], [MouseEvent, 'mouseup']]) { try { el.dispatchEvent(new T(type, { ...o, buttons: 0 })); } catch (_) {} }
    el.click();
  }
  async function waitFor(fn, ms, step = 200) { const end = Date.now() + ms; let v; while (Date.now() < end) { v = fn(); if (v) return v; await sleep(step); } return fn() || null; }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function run() {
    let res;
    try { res = await chrome.runtime.sendMessage({ type: 'connect:job' }); } catch (_) { return; }
    if (!res || !res.ok || !res.job) return;   // not a tab we opened: do nothing
    const job = res.job;
    if (/\/(authwall|login|checkpoint|uas\/login)/.test(location.pathname) || document.querySelector('form.login__form, #username')) { banner('warn', t('li_login')); return; }
    if (await waitFor(findPending, 3000)) { banner('warn', t('li_pending'), { note: job.note }); reportInvited(); return; }
    banner('', t('li_instructions'), { note: job.note, debug: true });

    // Wait (up to 10 minutes) for the note box. Meanwhile, if the invitation dialog shows up without one, try the
    // "Add a note" button once; if the page ignores that click, tell the user to click it.
    const deadline = Date.now() + 10 * 60 * 1000;
    let ta = null, triedAddNote = false, limitShown = false;
    while (!ta && Date.now() < deadline) {
      ta = noteBox();
      if (ta) break;
      const dlg = dialog();
      if (dlg) {
        if (!limitShown && LIMIT.test(dlg.innerText || '')) { limitShown = true; banner('warn', t('li_note_limit'), { note: job.note }); }
        else if (!triedAddNote) {
          triedAddNote = true;
          const add = [...dlg.querySelectorAll('button, a[role="button"]')].filter(visible).find(el => ADD_NOTE.test(txt(el)) || /add a (free )?note/i.test(el.getAttribute('aria-label') || ''));
          if (add) { humanClick(add); ta = await waitFor(noteBox, 2500); }
          if (!ta && !limitShown) banner('', t('li_add_note'), { note: job.note, debug: true });
        }
      }
      if (!ta) await sleep(400);
    }
    if (!ta) return;
    if (ta.value && ta.value.trim()) { banner('ok', t('li_filled'), { note: job.note }); return; }   // the user already typed something: leave it
    const max = Number(ta.getAttribute('maxlength')) || 300;
    setNativeValue(ta, job.note.length > max ? job.note.slice(0, max) : job.note);
    ta.focus();
    banner('ok', t('li_filled'), { note: job.note });
    try { chrome.runtime.sendMessage({ type: 'connect:done' }); } catch (_) {}
    // After Send (clicked, toast shown or "Pending" appears) tell the side panel, so it stops offering Connect.
    if (await waitFor(sentEvidence, 10 * 60 * 1000, 1000)) reportInvited();
  }
  run();
})();
