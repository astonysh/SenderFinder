// Runs before the stylesheet paints: applies the last chosen light/dark theme so the page does not flash.
try { const v = localStorage.getItem('el-theme'); if (v === 'light' || v === 'dark') document.documentElement.dataset.theme = v; } catch (_) {}
