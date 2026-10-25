// Tiny i18n helpers over chrome.i18n. Falls back to the key so a missing message is visible, not blank.
export const t = (key, subs) => { const m = chrome.i18n.getMessage(key, subs == null ? undefined : Array.isArray(subs) ? subs.map(String) : [String(subs)]); return m || key; };
// Localise static markup: data-i18n (textContent), data-i18n-placeholder, data-i18n-title, data-i18n-aria.
export function localizeDocument(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  document.documentElement.lang = chrome.i18n.getUILanguage() || 'en';
}
