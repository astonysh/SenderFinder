// Light / dark theme for extension pages. 'system' follows prefers-color-scheme; the choice lives in settings.theme
// and is mirrored to localStorage so theme-boot.js can apply it before first paint.
const media = window.matchMedia('(prefers-color-scheme: dark)');
let current = 'system';

export function applyTheme(theme) {
  current = theme === 'light' || theme === 'dark' ? theme : 'system';
  if (current === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = current;
  try { if (current === 'system') localStorage.removeItem('el-theme'); else localStorage.setItem('el-theme', current); } catch (_) {}
  for (const fn of listeners) fn(effectiveTheme());
}
export const effectiveTheme = () => (current === 'system' ? (media.matches ? 'dark' : 'light') : current);

const listeners = new Set();
export function onThemeChange(fn) { listeners.add(fn); }
media.addEventListener('change', () => { if (current === 'system') for (const fn of listeners) fn(effectiveTheme()); });

// Keep every open extension page in step when the theme is changed elsewhere.
export function watchTheme() {
  chrome.storage.local.get('settings').then(({ settings }) => applyTheme(settings && settings.theme));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) applyTheme(changes.settings.newValue && changes.settings.newValue.theme);
  });
}
