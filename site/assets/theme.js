/* Light / dark switch for the website: one button, no menu. The page follows the system until the visitor
   clicks; each click flips to the other theme. Flipping back to the theme the system already uses goes back
   to following the system, so only a deviation is remembered (localStorage "el-theme", read by
   theme-boot.js before first paint). Without JavaScript the button stays hidden and the site follows the system. */

const KEY = 'el-theme';
const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');

const systemTheme = () => (media.matches ? 'dark' : 'light');

const stored = () => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch (_) { return 'system'; }
};

let current = stored();
const shown = () => (current === 'system' ? systemTheme() : current);

function paint() {
  if (current === 'system') delete root.dataset.theme;
  else root.dataset.theme = current;
  const next = shown() === 'dark' ? 'light' : 'dark';
  for (const button of document.querySelectorAll('.theme-switch')) {
    button.setAttribute('aria-label', button.dataset[next === 'dark' ? 'labelDark' : 'labelLight']);
    button.title = button.getAttribute('aria-label');
  }
}

function toggle() {
  const next = shown() === 'dark' ? 'light' : 'dark';
  current = next === systemTheme() ? 'system' : next;
  try {
    if (current === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, current);
  } catch (_) { /* storage blocked: the choice still applies to this page */ }
  paint();
}

root.classList.add('js');
paint();

for (const button of document.querySelectorAll('.theme-switch')) button.addEventListener('click', toggle);

// Following the system means following it when it changes too.
media.addEventListener('change', () => { if (current === 'system') paint(); });

/* The notice at the bottom of every page. Two modes, chosen at build time in site-src/site.config.json:
   - consentMode false (today): informational, one OK, stored as sf-notice. The site sets no cookies.
   - consentMode true (once analytics is added): Accept / Reject, stored as sf-consent, AND exposed as
     <html data-consent="granted|denied"> plus a window event "sf:consent" that a loader can wait for.
   It starts hidden in the markup, so nothing appears and nothing is stored without JavaScript. */
const NOTICE = document.getElementById('notice');
if (NOTICE) {
  const consentMode = NOTICE.dataset.consentMode === 'true';
  const KEY = consentMode ? 'sf-consent' : 'sf-notice';
  let decided = false;
  try { decided = Boolean(localStorage.getItem(KEY)); } catch (_) {}
  if (!decided) {
    NOTICE.hidden = false;
    root.classList.add('notice-on');
    const close = value => {
      try { localStorage.setItem(KEY, consentMode ? value : '1'); } catch (_) {}
      if (consentMode) {
        root.dataset.consent = value;
        window.sfConsent = value;
        window.dispatchEvent(new window.CustomEvent('sf:consent', { detail: value }));
      }
      NOTICE.hidden = true;
      root.classList.remove('notice-on');
    };
    for (const button of NOTICE.querySelectorAll('[data-consent]')) {
      button.addEventListener('click', () => {
        const value = button.dataset.consent;
        close(value === 'granted' || value === 'denied' ? value : 'ack');
      });
    }
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !NOTICE.hidden) close('ack');
    });
  }
}
