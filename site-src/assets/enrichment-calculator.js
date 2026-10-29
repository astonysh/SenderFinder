import { CHAINS, PRICES, estimate, makeFormatters } from './calc.js';

const form = document.getElementById('enrichment-calculator');

if (form) {
  const volume = document.getElementById('enrich-volume');
  const mode = document.getElementById('enrich-mode');
  const skip = document.getElementById('enrich-skip');
  const skipOutput = document.getElementById('enrich-skip-output');
  const monthly = document.getElementById('enrich-monthly');
  const perThousand = document.getElementById('enrich-per-thousand');
  const hitRate = document.getElementById('enrich-hit-rate');
  const found = document.getElementById('enrich-found');
  const costPerFound = document.getElementById('enrich-cost-per-found');
  const unresolved = document.getElementById('enrich-unresolved');
  const breakdown = document.getElementById('enrich-breakdown');
  const fmt = makeFormatters(document.documentElement.lang || 'en');
  const names = { blitzapi: 'BlitzAPI', hunter: 'Hunter', quickenrich: 'QuickEnrich', apollo: 'Apollo' };

  const update = () => {
    const inputs = Math.min(1000000, Math.max(1, Number(volume.value) || 1));
    const skipShare = Number(skip.value) / 100;
    const processed = inputs * (1 - skipShare);
    const model = estimate({ perDay: inputs / 30, mode: mode.value, skipShare });
    const expectedFound = processed * model.found;
    const expectedUnresolved = processed * (1 - model.found);
    const costFound = expectedFound > 0 ? model.monthlyUsd / expectedFound : 0;

    skipOutput.textContent = fmt.percent(skipShare);
    monthly.textContent = fmt.monthly(model.monthlyUsd);
    perThousand.textContent = fmt.monthly(model.perAddress * (1 - skipShare) * 1000);
    hitRate.textContent = fmt.percent(model.found);
    found.textContent = fmt.count(expectedFound);
    costPerFound.textContent = fmt.perAddress(costFound);
    unresolved.textContent = fmt.count(expectedUnresolved);

    breakdown.replaceChildren();
    let reach = 1;
    for (const step of CHAINS[mode.value] || CHAINS.both) {
      const calls = processed * reach;
      const matches = calls * step.p;
      const spend = (step.billed === 'call' ? calls : matches) * PRICES[step.step];
      const row = document.createElement('tr');
      for (const text of [names[step.step], fmt.count(calls), fmt.count(matches), fmt.monthly(spend)]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      breakdown.append(row);
      reach -= reach * step.p;
    }
  };

  for (const input of [volume, mode, skip]) {
    input.addEventListener('input', update);
    input.addEventListener('change', update);
  }
  update();
}
