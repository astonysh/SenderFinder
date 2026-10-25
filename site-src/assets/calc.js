/* Cost model for the price calculator, and the browser wiring for it.
   Two consumers, one source of truth:
     - the page (this file is loaded as a module from /assets/calc.js)
     - scripts/build-site.js, which imports it to render the no-JavaScript fallback table
   Everything here comes from README.md: the provider catalog prices and the step hit rates of the
   50-address benchmark, both dated 2026-10-25. No other numbers are invented. */

export const PRICE_DATE = '2026-10-25';

/* Catalog price of one successful lookup, in USD (README "How a lookup works", 2026-10-25).
   Misses are free on all of these steps, so a step only costs money when it answers. */
export const PRICES = {
  blitzapi: 0.0005,
  quickenrich: 0.0048,
  hunter: 0.0049,
  apollo: 0.026,
};

/* The waterfall per key choice, in the order the extension runs it.
   p = probability that this step answers, given that the chain reached it.
     0.48      = 24 of the 50 benchmark addresses were solved by BlitzAPI (the first paid step)
     0.19      = of the addresses left after it, 5 of 26 (Hunter) and 4 of 21 (QuickEnrich) matched
     0.894     = Apollo matched 17 of the 19 addresses it was called for
   billed = 'hit'  → charged when it answers
            'call' → charged whenever it is reached (Apollo returned a profile on all 19 calls,
                     including the two whose name did not match and were shown as "uncertain") */
export const CHAINS = {
  both: [
    { step: 'blitzapi', p: 0.48, billed: 'hit' },
    { step: 'hunter', p: 0.19, billed: 'hit' },
    { step: 'quickenrich', p: 0.19, billed: 'hit' },
    { step: 'apollo', p: 0.894, billed: 'call' },
  ],
  treg: [
    { step: 'blitzapi', p: 0.48, billed: 'hit' },
    { step: 'quickenrich', p: 0.19, billed: 'hit' },
  ],
  monid: [
    { step: 'hunter', p: 0.19, billed: 'hit' },
    { step: 'apollo', p: 0.894, billed: 'call' },
  ],
};

export const MODES = ['both', 'treg', 'monid'];
export const DEFAULTS = { perDay: 20, mode: 'both', skipShare: 0.2 };
export const FALLBACK_VOLUMES = [10, 30, 100];
export const CAPS = { dailyUsd: 2, perLookupUsd: 0.05, autoPerDay: 30 };
const DAYS_PER_MONTH = 30;

/* Expected cost of one new address, the share of addresses that come back with a matching name,
   and the monthly totals for a volume of new senders per day. */
export function estimate({ perDay = DEFAULTS.perDay, mode = DEFAULTS.mode, skipShare = DEFAULTS.skipShare } = {}) {
  const chain = CHAINS[mode] || CHAINS.both;
  let reach = 1;         // share of addresses still unanswered when the step is reached
  let perAddress = 0;    // USD paid per address that goes through the chain
  let found = 0;         // share of addresses answered with a matching name
  for (const s of chain) {
    const price = PRICES[s.step];
    const hits = reach * s.p;
    perAddress += (s.billed === 'call' ? reach : hits) * price;
    found += hits;
    reach -= hits;
  }
  const payingPerDay = Math.max(0, perDay) * (1 - Math.min(0.95, Math.max(0, skipShare)));
  return {
    mode,
    perAddress,
    found,
    monthlyUsd: payingPerDay * DAYS_PER_MONTH * perAddress,
    foundPerMonth: payingPerDay * DAYS_PER_MONTH * found,
    perDay: payingPerDay,
    addressesPerDailyCap: perAddress > 0 ? Math.floor(CAPS.dailyUsd / perAddress) : Infinity,
  };
}

/* Formatting that follows the page language, so "$0.0099" reads correctly everywhere. */
export function makeFormatters(lang) {
  const money = (value, extra = 0) => new Intl.NumberFormat(lang, {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: extra, maximumFractionDigits: extra,
  }).format(value);
  const pct = value => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(value);
  const count = value => new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(value);
  return {
    monthly: v => money(v, 2),
    perAddress: v => money(v, 4),
    percent: pct,
    count,
  };
}

/* ----------------------------------------------------------------------------------------------
   Browser wiring. Hidden by CSS until this module runs, so the static fallback stays for no-JS. */
if (typeof document !== 'undefined') {
  document.documentElement.classList.add('js');

  const root = document.getElementById('calc');
  if (root) {
    const el = {
      volume: document.getElementById('calc-volume'),
      volumeOut: document.getElementById('calc-volume-out'),
      keys: document.getElementById('calc-keys'),
      skip: document.getElementById('calc-skip'),
      skipOut: document.getElementById('calc-skip-out'),
      monthly: document.getElementById('calc-monthly'),
      per: document.getElementById('calc-per'),
      hit: document.getElementById('calc-hit'),
      found: document.getElementById('calc-found'),
      usable: document.getElementById('calc-usable'),
    };
    const template = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    const fmt = makeFormatters(document.documentElement.lang || 'en');

    const update = () => {
      const perDay = Number(el.volume.value);
      const skipShare = Number(el.skip.value) / 100;
      const result = estimate({ perDay, mode: el.keys.value, skipShare });

      el.volumeOut.textContent = fmt.count(perDay);
      el.skipOut.textContent = fmt.percent(skipShare);
      el.monthly.textContent = fmt.monthly(result.monthlyUsd);
      el.per.textContent = fmt.perAddress(result.perAddress);
      el.hit.textContent = fmt.percent(result.found);
      el.found.textContent = fmt.count(result.foundPerMonth);
      el.usable.textContent = template(root.dataset.usable, {
        n: fmt.count(Number.isFinite(result.addressesPerDailyCap) ? result.addressesPerDailyCap : 0),
      });
    };

    for (const input of [el.volume, el.keys, el.skip]) {
      input.addEventListener('input', update);
      input.addEventListener('change', update);
    }
    update();
  }
}
