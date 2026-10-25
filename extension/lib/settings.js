// Extension settings (chrome.storage.local) and the lookup service built from them.
// Keys never leave this device: they live in extension storage and are only sent to the provider they belong to.
import { createStore, idbBackend } from '../core/store.js';
import { createLookup, STEPS, DEFAULT_STEPS } from '../core/waterfall.js';
import { createMonidClient } from '../core/providers/monid.js';
import { createTregClient } from '../core/providers/treg.js';
import { createFirecrawlClient } from '../core/providers/firecrawl.js';

export const ALL_STEP_IDS = Object.keys(STEPS);

export const DEFAULTS = Object.freeze({
  keys: { monid: '', treg: '', firecrawl: '' },
  stepOrder: ALL_STEP_IDS.slice(),                       // every known step, in the order to try
  stepsEnabled: Object.fromEntries(ALL_STEP_IDS.map(id => [id, DEFAULT_STEPS.includes(id)])),
  lookupMaxUsd: 0.05,
  dailyCapUsd: 2,
  skipFreeMail: true,
  autoLookup: true,                                      // look up the sender of the opened message automatically
  autoDailyLimit: 30,                                    // automatic lookups per day; beyond that everything is manual
  showCost: true,
  firecrawlUsdPerCredit: 0.0032,
  cacheMaxEntries: 5000,
  cacheMaxAgeDays: 90,
  telemetry: true,                                       // anonymous daily usage counts; on by default, one switch to turn off (see core/telemetry.js)
  connectNote: '',                                       // LinkedIn invitation note template; '' = the locale default (connect_note_default)
  theme: 'system',                                      // side panel / settings look: 'system' | 'light' | 'dark'
  connectSignature: true,                                // append the "sent via SenderFinder" line to the note
});

const num = (v, d, min = 0) => { const n = Number(v); return Number.isFinite(n) && n >= min ? n : d; };

export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const keys = { ...DEFAULTS.keys, ...(s.keys && typeof s.keys === 'object' ? s.keys : {}) };
  for (const k of Object.keys(keys)) keys[k] = typeof keys[k] === 'string' ? keys[k].trim() : '';
  const order = Array.isArray(s.stepOrder) ? s.stepOrder.filter(id => STEPS[id]) : [];
  for (const id of ALL_STEP_IDS) if (!order.includes(id)) order.push(id);
  const enabled = { ...DEFAULTS.stepsEnabled, ...(s.stepsEnabled && typeof s.stepsEnabled === 'object' ? s.stepsEnabled : {}) };
  return {
    keys, stepOrder: order, stepsEnabled: Object.fromEntries(ALL_STEP_IDS.map(id => [id, enabled[id] !== false])),
    lookupMaxUsd: num(s.lookupMaxUsd, DEFAULTS.lookupMaxUsd),
    dailyCapUsd: num(s.dailyCapUsd, DEFAULTS.dailyCapUsd),
    skipFreeMail: s.skipFreeMail !== false,
    autoLookup: s.autoLookup !== false,
    autoDailyLimit: Math.round(num(s.autoDailyLimit, DEFAULTS.autoDailyLimit)),
    showCost: s.showCost !== false,
    firecrawlUsdPerCredit: num(s.firecrawlUsdPerCredit, DEFAULTS.firecrawlUsdPerCredit, 0.00001),
    cacheMaxEntries: Math.round(num(s.cacheMaxEntries, DEFAULTS.cacheMaxEntries, 100)),
    cacheMaxAgeDays: Math.round(num(s.cacheMaxAgeDays, DEFAULTS.cacheMaxAgeDays, 1)),
    telemetry: s.telemetry !== false,
    connectNote: typeof s.connectNote === 'string' ? s.connectNote.slice(0, 600) : '',
    connectSignature: s.connectSignature !== false,
    theme: ['light', 'dark'].includes(s.theme) ? s.theme : 'system',
  };
}

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return normalizeSettings(settings);
}
export async function setSettings(patch) {
  const cur = await getSettings();
  const next = normalizeSettings({ ...cur, ...patch, keys: { ...cur.keys, ...(patch && patch.keys) } });
  await chrome.storage.local.set({ settings: next });
  return next;
}
// What content scripts may know. Never the keys.
export const publicSettings = s => ({ autoLookup: s.autoLookup, showCost: s.showCost, autoDailyLimit: s.autoDailyLimit, skipFreeMail: s.skipFreeMail, theme: s.theme });

export function hasAnyKey(s) { return !!(s.keys.monid || s.keys.treg || s.keys.firecrawl); }

// Builds store + provider clients + waterfall from settings. Call again when settings change.
export function buildService(settings, { backend } = {}) {
  const store = createStore({ backend: backend || idbBackend(), maxEntries: settings.cacheMaxEntries, maxAgeDays: settings.cacheMaxAgeDays });
  const monid = createMonidClient({ apiKey: settings.keys.monid, pollMs: 1500, deadlineMs: 45000 });
  const treg = createTregClient({ token: settings.keys.treg });
  const firecrawl = createFirecrawlClient({ apiKey: settings.keys.firecrawl, usdPerCredit: settings.firecrawlUsdPerCredit });
  const config = { steps: settings.stepOrder.filter(id => settings.stepsEnabled[id]), lookupMaxUsd: settings.lookupMaxUsd, dailyCapUsd: settings.dailyCapUsd, skipFreeMail: settings.skipFreeMail };
  const service = createLookup({ store, config, monid, treg, firecrawl, log: (...a) => console.log('[senderfinder]', ...a) });
  return { store, service, clients: { monid, treg, firecrawl }, config };
}

// Step catalogue for the options page: order, enabled flag, whether its provider has a key.
export function describeSteps(settings) {
  const configured = { local: true, monid: !!settings.keys.monid, treg: !!settings.keys.treg, firecrawl: !!settings.keys.firecrawl };
  return settings.stepOrder.map(id => {
    const s = STEPS[id];
    const vendor = s.provider.split(':')[0];
    return { id, label: s.label, provider: s.provider, vendor, maxUsd: s.maxUsd, credits: s.credits || null, enabled: settings.stepsEnabled[id], configured: configured[vendor] };
  });
}
