// The benchmark page table must be generated from the committed results file, never hand-typed.
// The expectations are recomputed from the same rows, so rerunning the benchmark with new data keeps
// the tests meaningful instead of pinning the previous run's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RESULTS_FILE, benchStats, computeBenchStats } from './bench-stats.js';

const rows = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
const stats = computeBenchStats(rows);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const calls = rows.flatMap(row => row.calls || []);

test('the aggregates cover every row and every call', () => {
  assert.equal(stats.rows, rows.length);
  assert.equal(stats.found, rows.filter(row => row.status === 'found').length);
  assert.equal(stats.uncertain, rows.filter(row => row.status === 'uncertain').length);
  assert.equal(stats.nameMatched, rows.filter(row => row.nameMatched === true).length);
  assert.equal(stats.nameMismatched, rows.filter(row => row.nameMatched === false).length);
  assert.equal(stats.totalCalls, calls.length);
  assert.ok(Math.abs(stats.totalUsd - sum(calls.map(call => call.usd || 0))) < 1e-9);
  assert.equal(stats.cached, rows.filter(row => row.cached).length);
});

test('per-step calls and hits are computed from the rows', () => {
  for (const step of stats.steps) {
    const stepCalls = calls.filter(call => call.step === step.step);
    assert.equal(step.calls, stepCalls.length, `${step.step}: calls`);
    assert.equal(step.hits, stepCalls.filter(call => call.status === 'hit').length, `${step.step}: hits`);
    assert.ok(Math.abs(step.spendUsd - sum(stepCalls.map(call => call.usd || 0))) < 1e-9, `${step.step}: spend`);
    assert.equal(step.final, rows.filter(row => row.step === step.step).length, `${step.step}: final answers`);
  }
  assert.deepEqual(stats.steps.slice(0, 5).map(step => step.step), ['blitzapi', 'hunter', 'quickenrich', 'apollo', 'datalegion']);
});

test('the table has one row per step and the same number of cells as headers', () => {
  assert.equal(stats.table.rows.length, stats.steps.length);
  assert.equal(stats.table.head.length, 7);
  for (const row of stats.table.rows) assert.equal(row.length, stats.table.head.length);
  assert.equal(stats.table.rows[0][0], 'BlitzAPI');
  assert.match(stats.table.rows[0][3], /^\d+\.\d%$/);
  assert.ok(stats.table.note.includes('scripts/bench-stats.js'));
});

test('per-address and per-found costs follow from the totals', () => {
  assert.ok(Math.abs(Number(stats.text.perAddress.slice(1)) - stats.totalUsd / rows.length) < 1e-3);
  assert.ok(Math.abs(Number(stats.text.perFound.slice(1)) - stats.totalUsd / stats.found) < 1e-3);
  assert.equal(stats.text.dailyCapAddresses, String(Math.floor(2 / (stats.totalUsd / rows.length))));
  assert.equal(String(stats.tregAnswered), stats.text.tregAnswered);
});

test('the aggregate output carries no address, name or profile URL', () => {
  const serialized = JSON.stringify(stats);
  assert.ok(!serialized.includes('@'), 'an email address leaked into the aggregate output');
  assert.ok(!/linkedin\.com\/in/i.test(serialized), 'a profile URL leaked into the aggregate output');
  assert.ok(!serialized.includes('wizleads-sample-50.csv'), 'raw sample data leaked into the aggregate output');
});

test('an empty results file is an error, not an empty table', () => {
  assert.throws(() => computeBenchStats([]), /empty/);
});

test('the default results file parses', () => {
  const fromFile = benchStats();
  assert.equal(fromFile.rows, rows.length);
});
