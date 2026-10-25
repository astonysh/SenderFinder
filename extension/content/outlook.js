'use strict';
// Outlook on the web (best effort). The DOM is obfuscated and changes; the sender's address is
// usually in a title/aria-label of the persona element in the reading pane.
(function () {
  const { createCard } = window.__elCard;
  let settings = { autoLookup: true, showCost: true };
  chrome.runtime.sendMessage({ type: 'settings' }).then(s => { if (s && s.ok) settings = s; }).catch(() => {});
  chrome.storage.onChanged.addListener(ch => { if (ch.autoLookup) settings.autoLookup = ch.autoLookup.newValue; if (ch.showCost) settings.showCost = ch.showCost.newValue; });

  const EMAIL = /<?([A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>?/;
  function senderIn(pane) {
    // Candidates: elements near the top of a message with the address in title / aria-label.
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
  function process(pane) {
    if (pane.dataset.elDone) return;
    const s = senderIn(pane);
    if (!s) return;
    pane.dataset.elDone = '1';
    const card = createCard({ email: s.email, name: s.name, autoLookup: settings.autoLookup, showCost: settings.showCost }, {
      lookup: ({ force }) => chrome.runtime.sendMessage({ type: 'lookup', email: s.email, name: s.name, signature: (pane.innerText || '').slice(-6000), force, source: 'outlook' }),
    });
    const header = s.el.closest('[role="heading"], header, div[class*="Header"]') || s.el.parentElement;
    (header || pane).insertAdjacentElement(header ? 'afterend' : 'afterbegin', card);
  }
  function scan() {
    document.querySelectorAll('[role="main"] [aria-label*="Reading" i], [data-app-section="ConversationContainer"], div[aria-label*="邮件正文"], div[aria-label*="Message body" i]').forEach(p => process(p.closest('[data-app-section], [role="document"], [role="main"]') || p));
  }
  const obs = new MutationObserver(() => { clearTimeout(scan.t); scan.t = setTimeout(scan, 250); });
  obs.observe(document.body, { childList: true, subtree: true });
  scan();
})();
