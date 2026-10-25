'use strict';
// Gmail: finds the expanded messages of the open thread, marks every sender with a small chip and tells the
// service worker who the thread is about: the sender of the newest message (or of a message the user expands
// later), the other participants and that message's signature. The side panel renders the result; nothing
// is inserted into Gmail's layout beyond the inline chip.
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

  const NOISE = /^(noreply|no-reply|do-not-reply|donotreply|notifications?|notify|newsletter|news|mailer-daemon|postmaster|bounce|calendar-notification|drive-shares-dm-noreply|comments-noreply|updates|digest|alerts?|info|support|sales|hello|contact|admin|team|hr|jobs|careers|billing|marketing|help|service)(\+.*)?$/i;
  const noisy = email => NOISE.test(email.split('@')[0]) || /\.(bounces|noreply|notifications)\.|^bounce|list-manage|mailchimp|sendgrid|amazonses/.test(email);
  // The signed-in address is in the page title: "Inbox - me@example.com - Gmail".
  const myAddress = () => { const m = /([^\s<>"(]+@[^\s<>")]+)/.exec(document.title || ''); return m ? m[1].toLowerCase() : null; };

  // ── Chips: one per expanded message, next to the sender's name. The dot mirrors the side panel's result. ──
  const chips = new Map();      // email -> Set<chip>
  const statuses = new Map();   // email -> 'pending' | 'found' | 'uncertain' | 'not_found' | 'skipped' | 'error' | null
  function chipFor(senderEl, email, name) {
    const row = senderEl.closest('.gE') || senderEl.parentElement;
    if (!row || row.querySelector('span[data-el-chip]')) return;
    const chip = createChip({ email, title: t('chip_title') }, async () => {
      let r = null;
      try { r = await send({ type: 'panel:open', email, name, source: 'gmail' }); } catch (_) { /* worker asleep */ }
      if (!r || !r.ok || !r.opened) chip.hint(t('chip_open_fallback'));
    });
    const go = row.querySelector('.go');
    (go && go.parentElement === senderEl.parentElement ? go : senderEl).insertAdjacentElement('afterend', chip.host);
    if (!chips.has(email)) chips.set(email, new Set());
    chips.get(email).add(chip);
    chip.setStatus(statuses.get(email) || null);
  }
  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.type === 'thread:resend') { lastSent = ''; scan(); return; }
    if (!msg || msg.type !== 'panel:state' || !msg.state) return;
    const results = msg.state.results || {};
    for (const [email, set] of chips) {
      const r = results[email];
      const s = !r ? null : r.pending ? 'pending' : r.ok === false ? 'error' : r.status || null;
      statuses.set(email, s);
      for (const c of set) { if (!c.host.isConnected) set.delete(c); else c.setStatus(s); }
    }
  });

  // ── Thread → subject ──
  function participantsOf(messageEls, sender, me) {
    const seen = new Map();
    const add = el => {
      const email = (el.getAttribute('email') || '').trim().toLowerCase();
      if (!email || !email.includes('@') || email === sender || email === me || noisy(email) || seen.has(email)) return;
      const name = (el.getAttribute('name') || el.textContent || '').trim();
      seen.set(email, { email, name: name && !name.includes('@') ? name : '' });
    };
    // Senders and recipients (To / Cc in the header and in the expanded "details" box) of every expanded message.
    for (const m of messageEls) m.querySelectorAll('span.gD[email], .gE span[email], .hb span[email], .iw span[email], .ajA span[email], .ajv span[email]').forEach(add);
    return [...seen.values()].slice(0, 20);
  }
  const senderOf = m => {
    const el = m.querySelector('.gE span.gD[email], .gE [email][name], span.gD[email]');
    if (!el) return null;
    const email = (el.getAttribute('email') || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return null;
    return { el, email, name: (el.getAttribute('name') || el.textContent || '').trim() };
  };
  const bodyOf = m => { const body = m.querySelector('.a3s, .ii.gt'); return body ? (body.innerText || body.textContent || '').slice(-6000) : ''; };
  const keyOf = (m, i, email) => { const c = m.closest('[data-message-id]'); return (c && c.getAttribute('data-message-id')) || (email + '#' + i); };

  let thread = null, threadOpenedAt = 0, seen = new Set(), lastSent = '';
  function scan() {
    if (dead || !alive()) return die();
    const all = [...document.querySelectorAll('div.gs, div.adn.ads')];
    const msgs = all.filter(m => !all.some(o => o !== m && m.contains(o)));   // innermost container per message
    const infos = msgs.map(m => ({ m, s: senderOf(m) })).filter(x => x.s);
    if (!infos.length) { thread = null; if (lastSent) { lastSent = ''; send({ type: 'thread:clear' }).catch(() => {}); } return; }
    const root = infos[0].m.closest('div[role="list"]') || infos[0].m.parentElement;
    if (root !== thread) { thread = root; threadOpenedAt = Date.now(); seen = new Set(); }
    const me = myAddress();
    infos.forEach(x => chipFor(x.s.el, x.s.email, x.s.name));
    // Subject: a message the user expands after the thread has settled (> 3 s) wins; otherwise the newest message
    // that is not mine (if every message is mine, the newest one, so that its recipients are listed).
    const late = Date.now() - threadOpenedAt > 3000;
    let pick = null;
    infos.forEach((x, i) => { const k = keyOf(x.m, i, x.s.email); if (!seen.has(k)) { seen.add(k); if (late) pick = x; } });
    if (!pick) pick = [...infos].reverse().find(x => x.s.email !== me) || infos[infos.length - 1];
    const { email, name } = pick.s;
    const reason = email === me ? 'me' : !settings.autoLookup ? 'auto_off' : noisy(email) ? 'noisy' : null;
    const participants = participantsOf(infos.map(x => x.m), email, me);
    const key = JSON.stringify([email, reason, participants.map(p => p.email)]);
    if (key === lastSent) return;
    lastSent = key;
    // One signature per sender (the tail of their newest message), so a lookup started from the panel can use it too.
    const signatures = {};
    for (const x of infos) { const body = bodyOf(x.m); if (body) signatures[x.s.email] = body; }
    send({ type: 'thread:update', source: 'gmail', subject: { email, name }, auto: !reason, reason, participants, signatures }).catch(() => {});
  }
  const safeScan = () => { try { scan(); } catch (e) { if (/context invalidated|Extension context/i.test(String(e && e.message))) die(); else throw e; } };
  const obs = new MutationObserver(() => { clearTimeout(scan.t); scan.t = setTimeout(safeScan, 150); });
  obs.observe(document.body, { childList: true, subtree: true });
  safeScan();
})();
