// Exports the raw quantities of the scenario runs the business case uses, so the cost model spreadsheet
// (docs/business/cost-model.xlsx) can recompute every cost with its own formulas from the rate card.
//
//   npm run export-business      → results/business-inputs.csv (averages of seeds 1 and 2)
//
// Columns are quantities, not costs: released parts, good parts, part-shifts in the line (WIP), stand-shifts in
// finished stock (README rule: average stock of shift s = stock after shift s-1 + half of shift s's production), units
// ordered / shipped / shipped on time, start and end stock, one-time cost, scheduled machines, OEE per machine.
// The last two columns are the code's own cost results, used to check the spreadsheet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRateCard } from '../src/economics/rateCard.js';
import { runScenario } from '../src/scenarios/run.js';
import { ALL_SCENARIOS } from '../src/scenarios/own.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const cm = JSON.parse(fs.readFileSync(path.join(root, 'config', 'countermeasures.json'), 'utf8'));
const rates = loadRateCard();
const SCENARIOS = ['baseline', 'supplier-outage', 'demand-swing', 'both', 'quarter-60'];
const OPTIONS = ['none', 'fg40', 'fg60', 'm3-ct12', 'm3-ct12-fg30', 'extra-m3'];
const SEEDS = [1, 2];

const header = ['scenario', 'option', 'label', 'shifts', 'machines', 'released', 'good_parts', 'scrap', 'wip_part_shifts',
  'fg_stand_shifts', 'ordered', 'shipped', 'shipped_on_time', 'start_stock', 'end_stock', 'one_time_cost_eur',
  'oee_M1', 'oee_M2', 'oee_M3', 'oee_M4', 'availability_M3', 'code_cost_per_good_unit_excl_fg', 'code_total_profit'];
const rows = [header];
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

for (const id of SCENARIOS) {
  const scenario = ALL_SCENARIOS.find((s) => s.id === id);
  for (const opt of OPTIONS) {
    const levers = opt === 'none' ? {} : cm.options[opt].levers;
    const r = await runScenario({ scenario, levers, seeds: SEEDS, rates });
    const start = levers.initialFinishedGoods ?? 0;
    const per = r.runs.map((x) => {
      let prev = start, fg = 0;
      for (const s of x.perShift) { fg += prev + s.produced / 2; prev = s.stock; }
      return {
        released: x.kpis.released, good: x.kpis.goodParts, scrap: x.kpis.scrap,
        wip: x.perShift.reduce((a, s) => a + s.wip, 0), fg, ordered: x.kpis.ordered,
        shipped: x.perShift.reduce((a, s) => a + s.shipped, 0), onTime: x.perShift.reduce((a, s) => a + s.shippedOnTime, 0),
        end: x.kpis.finishedGoodsEnd, m: x.kpis.machines,
        cpu: x.costs.costPerGoodUnitExFg, profit: x.costs.totalProfit,
      };
    });
    const avg = (k) => +mean(per.map((p) => p[k])).toFixed(4);
    const oee = (mid) => +mean(per.map((p) => p.m[mid]?.oee.value ?? 0)).toFixed(4);
    rows.push([id, opt, opt === 'none' ? 'No countermeasure' : cm.options[opt].label, scenario.shifts ?? 20,
      Object.keys(r.runs[0].kpis.machines).join(' '), avg('released'), avg('good'), avg('scrap'), avg('wip'), avg('fg'),
      avg('ordered'), avg('shipped'), avg('onTime'), start, avg('end'), r.pricing.total,
      oee('M1'), oee('M2'), oee('M3'), oee('M4'), +mean(per.map((p) => p.m.M3.oee.availability)).toFixed(4), avg('cpu'), avg('profit')]);
  }
  process.stdout.write(`${id} done\n`);
}
fs.writeFileSync(path.join(root, 'results', 'business-inputs.csv'), rows.map((r) => r.join(',')).join('\n') + '\n');
console.log('Wrote results/business-inputs.csv');
