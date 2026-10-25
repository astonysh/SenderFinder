/* Aggregate the benchmark results file for the website. No personal data leaves this module: only
   counts, rates, prices and totals are returned. The page table is generated from these numbers, so a
   rerun of `npm run bench -- data/bench/wizleads-sample-50.csv` updates the site with `npm run site`. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, '..');
export const RESULTS_FILE = path.join(ROOT, 'data', 'bench', 'wizleads-sample-50.results.json');

const STEP_ORDER = ['blitzapi', 'hunter', 'quickenrich', 'apollo', 'datalegion'];
const STEP_LABEL = {
  blitzapi: 'BlitzAPI',
  hunter: 'Hunter',
  quickenrich: 'QuickEnrich',
  apollo: 'Apollo',
  datalegion: 'Data Legion',
};

const usd = (n, digits = 6) => {
  if (!Number.isFinite(n)) return '—';
  const text = n.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
  return `$${text}`;
};
const percent = n => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—');
const modal = values => {
  if (!values.length) return null;
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
};
const stepTotal = (steps, keys) => keys.reduce((sum, key) => sum + steps.get(key).spendUsd, 0);

export function computeBenchStats(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('bench: results file is empty');

  // Keep the familiar order for the known steps, then append any step a future run adds.
  const present = [...new Set(rows.flatMap(row => (row.calls || []).map(call => call.step)))];
  const order = [...STEP_ORDER.filter(step => present.includes(step)), ...present.filter(step => !STEP_ORDER.includes(step)).sort()];
  const steps = new Map(order.map(step => [step, {
    step, calls: 0, hits: 0, misses: 0, errors: 0, skipped: 0, other: 0,
    chargedCalls: 0, spendUsd: 0, prices: [], final: 0, finalFound: 0, finalUncertain: 0,
  }]));
  let found = 0;
  let uncertain = 0;
  let nameMatched = 0;
  let nameMismatched = 0;
  let nameUnknown = 0;
  let cached = 0;

  for (const row of rows) {
    if (row.status === 'found') found++;
    else if (row.status === 'uncertain') uncertain++;
    if (row.nameMatched === true) nameMatched++;
    else if (row.nameMatched === false) nameMismatched++;
    else nameUnknown++;
    if (row.cached) cached++;

    const finalStep = steps.get(row.step);
    if (finalStep) {
      finalStep.final++;
      if (row.status === 'found') finalStep.finalFound++;
      else if (row.status === 'uncertain') finalStep.finalUncertain++;
    }

    for (const call of row.calls || []) {
      const step = steps.get(call.step);
      if (!step) continue;
      step.calls++;
      if (call.status === 'hit') step.hits++;
      else if (call.status === 'miss') step.misses++;
      else if (call.status === 'error') step.errors++;
      else if (call.status === 'skipped') step.skipped++;
      else step.other++;
      if (call.usd > 0) {
        step.chargedCalls++;
        step.spendUsd += call.usd;
        step.prices.push(call.usd);
      }
    }
  }

  const totalUsd = [...steps.values()].reduce((sum, step) => sum + step.spendUsd, 0);
  const totalCalls = [...steps.values()].reduce((sum, step) => sum + step.calls, 0);
  const tregSpend = stepTotal(steps, ['blitzapi', 'quickenrich']);
  // What the treg key alone would have answered: BlitzAPI ran on every row, and QuickEnrich ran whenever
  // BlitzAPI missed or did not match. A row whose final answer came from Monid but had an earlier treg
  // hit would be uncertain without Apollo to confirm it. Monid alone cannot be reconstructed the same
  // way: Hunter was never called on the rows BlitzAPI had already solved.
  const tregSteps = new Set(['blitzapi', 'quickenrich']);
  let tregFound = 0;
  let tregUncertain = 0;
  for (const row of rows) {
    const finalInTreg = tregSteps.has(row.step);
    const tregHit = (row.calls || []).some(call => tregSteps.has(call.step) && call.status === 'hit');
    const outcome = finalInTreg ? row.status : tregHit ? 'uncertain' : 'not_found';
    if (outcome === 'found') tregFound++;
    else if (outcome === 'uncertain') tregUncertain++;
  }
  const tregAnswered = tregFound + tregUncertain;
  const apollo = steps.get('apollo') || { calls: 0, hits: 0, final: 0, spendUsd: 0 };

  const tableRows = order.map(key => {
    const step = steps.get(key);
    const final = step.step === 'datalegion' && !step.hits
      ? `0 (${step.skipped} skipped)`
      : step.step === 'apollo' && step.hits > step.final
        ? `${step.final} found (+${step.hits - step.final} name mismatch)`
        : step.finalUncertain
          ? `${step.final} (${step.finalFound} found, ${step.finalUncertain} uncertain)`
          : `${step.final} found`;
    return [
      STEP_LABEL[key] || key,
      String(step.calls),
      String(step.hits),
      step.calls && step.skipped !== step.calls ? percent(step.hits / step.calls) : '—',
      final,
      step.prices.length ? usd(modal(step.prices)) : '—',
      usd(step.spendUsd),
    ];
  });

  const table = {
    head: ['Step', 'Reached', 'Answered', 'Hit rate', 'Final answer', 'Observed price', 'Spend'],
    rows: tableRows,
    note: 'Computed from <code>data/bench/wizleads-sample-50.results.json</code> by <code>scripts/bench-stats.js</code>; '
      + 'the table regenerates on <code>npm run site</code>. Spend is the run\'s own USD ledger, including any '
      + 'billed misses and the provider\'s observed (not catalog-rounded) per-call charges.',
  };

  const text = {
    rows: String(rows.length),
    found: String(found),
    uncertain: String(uncertain),
    nameMatched: String(nameMatched),
    nameMismatched: String(nameMismatched),
    nameUnknown: String(nameUnknown),
    cached: String(cached),
    totalUsd: usd(totalUsd, 4),
    perAddress: usd(rows.length ? totalUsd / rows.length : 0, 4),
    perFound: usd(found ? totalUsd / found : 0, 4),
    totalCalls: String(totalCalls),
    tregAnswered: String(tregAnswered),
    tregFound: String(tregFound),
    tregUncertain: String(tregUncertain),
    tregShare: percent(rows.length ? tregAnswered / rows.length : 0),
    tregSpend: usd(tregSpend, 4),
    tregPerAddress: usd(rows.length ? tregSpend / rows.length : 0, 4),
    apolloCalls: String(apollo.calls),
    apolloHits: String(apollo.hits),
    apolloFinal: String(apollo.final),
    apolloSpend: usd(apollo.spendUsd, 4),
    apolloShare: percent(totalUsd ? apollo.spendUsd / totalUsd : 0),
    cheapSpend: usd(totalUsd - apollo.spendUsd, 4),
    dailyCapAddresses: String(Math.floor(2 / (totalUsd / rows.length))),
  };

  return { rows: rows.length, found, uncertain, nameMatched, nameMismatched, nameUnknown, cached, totalUsd, totalCalls, tregAnswered, tregFound, tregUncertain, tregSpend, steps: [...steps.values()], table, text };
}

export function benchStats() {
  return computeBenchStats(JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')));
}
