/* Runs before the stylesheet paints (blocking <script> in <head>), so a saved Light/Dark choice and a stored
   analytics decision are applied before the first frame. Same theme model as the extension
   (extension/theme-boot.js): 'system' is the default and leaves no attribute, an explicit choice is
   remembered in localStorage under "el-theme". <html data-consent> is what any analytics script should
   read before it loads: "granted", "denied" or "pending". */
try {
  const v = localStorage.getItem('el-theme');
  if (v === 'light' || v === 'dark') document.documentElement.dataset.theme = v;
} catch (_) {}
try {
  const c = localStorage.getItem('sf-consent');
  document.documentElement.dataset.consent = c === 'granted' || c === 'denied' ? c : 'pending';
} catch (_) {
  document.documentElement.dataset.consent = 'pending';
}
