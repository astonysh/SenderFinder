'use strict';
// Outlook on the web (best effort). The DOM is obfuscated and changes; the sender's address is usually in a
// title/aria-label of the persona element in the reading pane. A chip goes next to it and the side panel shows the result.
(function () {
  // The extension was reloaded or updated while this page stayed open: the old script must go quiet instead of
  // throwing "Extension context invalidated" on every mutation. (The new script instance takes over on reload.)
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  let dead = false;
  function die() { if (dead) return; dead = true; try { if (typeof obs !== 'undefined') obs.disconnect(); } catch (_) {} document.querySelectorAll('span[data-el-chip]').forEach(n => n.remove()); }
  const send = msg => { if (dead || !alive()) { die(); return Promise.reject(new Error('EXTENSION_RELOADED')); } try { return chrome.runtime.sendMessage(msg).catch(e => { if (/context invalidated/i.test(String(e && e.message))) die(); throw e; }); } catch (e) { die(); return Promise.reject(e); } };
  const { createChip } = window.__elChip;
  document.querySelectorAll('span[data-el-chip]').forEach(n => n.remove());   // left by a previous instance (extension reloaded)
  const t = (k, subs) => { try { return chrome.i18n.getMessage(k, subs == null ? undefined : [String(subs)]) || k; } catch (_) { return k; } };
  let settings = { autoLookup: true, showCost: true };
  const loadSettings = () => send({ type: 'ui:settings' }).then(s => { if (s && s.ok) settings = s; }).catch(() => {});
  loadSettings();
  chrome.storage.onChanged.addListener(ch => { if (ch.settings) loadSettings(); });

  const EMAIL = /<?([A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>?/;
  function senderIn(pane) {
    const els = pane.querySelectorAll('[title*="@"], [aria-label*="@"], span[class*="Persona"], div[class*="Persona"]');
    for (const el of els) {
      const txt = (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '');
      const m = EMAIL.exec(txt);
      if (!m) continue;
      const name = (el.textContent || '').trim().replace(EMAIL, '').replace(/[<>]/g, '').trim();
      return { email: m[1].toLowerCase(), name, el };
    }
    return null;
  }
  const chips = new Map(); const statuses = new Map();
  function chipFor(el, email, name) {
    const parent = el.parentElement; if (!parent || parent.querySelector('span[data-el-chip]')) return;
    const chip = createChip({ email, title: t('chip_title') }, async () => {
      let r = null;
      try { r = await send({ type: 'panel:open', email, name, source: 'outlook' }); } catch (_) {}
      if (!r || !r.ok || !r.opened) chip.hint(t('chip_open_fallback'));
    });
    el.insertAdjacentElement('afterend', chip.host);
    if (!chips.has(email)) chips.set(email, new Set());
    chips.get(email).add(chip); chip.setStatus(statuses.get(email) || null);
  }
  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.type === 'thread:resend') { lastSent = ''; scan(); return; }
    if (!msg || msg.type !== 'panel:state' || !msg.state) return;
    const results = msg.state.results || {};
    for (const [email, set] of chips) {
      const r = results[email]; const s = !r ? null : r.pending ? 'pending' : r.ok === false ? 'error' : r.status || null;
      statuses.set(email, s);
      for (const c of set) { if (!c.host.isConnected) set.delete(c); else c.setStatus(s); }
    }
  });

  let lastSent = '';
  function scan() {
    if (dead || !alive()) return die();
    const hit = document.querySelector('[role="main"] [aria-label*="Reading" i], [data-app-section="ConversationContainer"], div[aria-label*="邮件正文"], div[aria-label*="Message body" i]');
    const pane = hit && (hit.closest('[data-app-section], [role="document"], [role="main"]') || hit);
    const s = pane && senderIn(pane);
    if (!s) { if (lastSent) { lastSent = ''; send({ type: 'thread:clear' }).catch(() => {}); } return; }
    chipFor(s.el, s.email, s.name);
    const reason = settings.autoLookup ? null : 'auto_off';
    const key = JSON.stringify([s.email, reason]);
    if (key === lastSent) return;
    lastSent = key;
    send({ type: 'thread:update', source: 'outlook', subject: { email: s.email, name: s.name }, auto: !reason, reason, participants: [], signatures: { [s.email]: (pane.innerText || '').slice(-6000) } }).catch(() => {});
  }
  const safeScan = () => { try { scan(); } catch (e) { if (/context invalidated|Extension context/i.test(String(e && e.message))) die(); else throw e; } };
  const obs = new MutationObserver(() => { clearTimeout(scan.t); scan.t = setTimeout(safeScan, 250); });
  obs.observe(document.body, { childList: true, subtree: true });
  safeScan();
})();
