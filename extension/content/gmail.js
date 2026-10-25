'use strict';
// Gmail: for every opened message, read the sender (span[email][name]) and the body text,
// and place a card under the sender line. Nothing is read from the page except that.
(function () {
  const { createCard } = window.__elCard;
  let settings = { autoLookup: true, showCost: true };
  chrome.runtime.sendMessage({ type: 'settings' }).then(s => { if (s && s.ok) settings = s; }).catch(() => {});
  chrome.storage.onChanged.addListener(ch => { if (ch.autoLookup) settings.autoLookup = ch.autoLookup.newValue; if (ch.showCost) settings.showCost = ch.showCost.newValue; });

  // The signed-in address is in the page title: "Inbox - me@example.com - Gmail".
  const myAddress = () => { const m = /([^\s<>"(]+@[^\s<>")]+)/.exec(document.title || ''); return m ? m[1].toLowerCase() : null; };

  function process(messageEl) {
    if (messageEl.dataset.elDone) return;
    const senderEl = messageEl.querySelector('.gE span.gD[email], .gE [email][name], span.gD[email]');
    if (!senderEl) return;
    const email = (senderEl.getAttribute('email') || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    messageEl.dataset.elDone = '1';
    const me = myAddress();
    if (me && email === me) return; // my own messages
    const name = (senderEl.getAttribute('name') || senderEl.textContent || '').trim();
    const headerRow = senderEl.closest('.gE') || senderEl.closest('.gF') || senderEl.parentElement;
    const anchor = (headerRow && headerRow.closest('.gH, .adn')) || headerRow;
    const card = createCard({ email, name, autoLookup: settings.autoLookup, showCost: settings.showCost }, {
      lookup: ({ force }) => {
        const body = messageEl.querySelector('.a3s, .ii.gt');
        const signature = body ? (body.innerText || body.textContent || '').slice(-6000) : '';
        return chrome.runtime.sendMessage({ type: 'lookup', email, name, signature, force, source: 'gmail' });
      },
    });
    (anchor || messageEl).insertAdjacentElement(anchor && anchor.classList.contains('gH') ? 'afterend' : 'afterbegin', card);
  }

  function scan() { document.querySelectorAll('div.gs, div.adn.ads').forEach(process); }
  const obs = new MutationObserver(() => { clearTimeout(scan.t); scan.t = setTimeout(scan, 150); });
  obs.observe(document.body, { childList: true, subtree: true });
  scan();
})();
