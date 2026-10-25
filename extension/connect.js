// Permission page for the "Connect" flow. chrome.permissions.request needs a user gesture on an extension
// page, so the service worker parks the job and opens this page; the click here grants and continues.
import { t, localizeDocument } from './lib/i18n.js';
localizeDocument();
const $ = id => document.getElementById(id);
const ORIGIN = 'https://www.linkedin.com/*';   // + cookies, so the side panel can also show the relationship
const res = await chrome.runtime.sendMessage({ type: 'connect:pending' });
if (!res || !res.ok || !res.job) { $('status').textContent = t('connect_nothing_pending'); $('grant').disabled = true; }
else $('note').textContent = res.job.note;
$('cancel').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'connect:cancel' }); window.close(); });
$('grant').addEventListener('click', async () => {
  $('grant').disabled = true;
  let granted = false;
  try { granted = await chrome.permissions.request({ permissions: ['cookies'], origins: [ORIGIN] }); } catch (e) { $('status').textContent = String(e && e.message || e); }
  if (!granted) { $('status').textContent = t('connect_denied'); $('grant').disabled = false; return; }
  $('status').textContent = t('connect_granted_opening');
  const r = await chrome.runtime.sendMessage({ type: 'connect:granted' });
  if (r && r.ok) setTimeout(() => window.close(), 400); else $('status').textContent = (r && r.message) || t('err_generic');
});
