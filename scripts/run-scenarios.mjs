// Scenario runner: reproducible results table and countermeasure comparison, without the LLM.
//
//   npm run scenarios          (or: node scripts/run-scenarios.mjs)
//
// Reads config/countermeasures.json (options + recommended option per scenario), config/business.json and
// data/rate_card.csv. Runs the four reference scenarios without and with every option, for the official seeds (1, 2)
// and the strict seeds (1–10). Writes to results/:
//   scenario-results.md / .csv          every scenario twice: without and with its recommended countermeasure
//   countermeasure-comparison.md / .csv every option in every scenario: effect, cost, payback, verification
//   scenarios.json                      all numbers, for the business spreadsheet and the advisor
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRateCard } from '../src/economics/rateCard.js';
import { AMORTISATION_SHIFTS } from '../src/economics/cost.js';
import { REFERENCE_SCENARIOS } from '../src/scenarios/reference.js';
import { runScenario } from '../src/scenarios/run.js';
import { summarise, officialCheck, strictCheck } from '../src/scenarios/verify.js';
import { describeLevers, validateLevers } from '../src/scenarios/levers.js';
import { DEFAULT_CONFIG } from '../src/simulation/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const cm = readJson('config/countermeasures.json');
const biz = readJson('config/business.json');
const rates = loadRateCard();
const outDir = path.join(root, 'results');

const OFFICIAL = biz.officialSeeds, STRICT = biz.strictSeeds;
const allSeeds = [...new Set([...OFFICIAL, ...STRICT])].sort((a, b) => a - b);
const pick = (runs, seeds) => runs.filter((r) => seeds.includes(r.seed));

// Validate the config file before spending time on runs.
for (const [id, o] of Object.entries(cm.options)) {
  const errors = validateLevers(o.levers, DEFAULT_CONFIG);
  if (errors.length) throw new Error(`option ${id}: ${errors.join('; ')}`);
}
for (const [sc, id] of Object.entries(cm.recommended)) {
  if (!REFERENCE_SCENARIOS.some((s) => s.id === sc)) throw new Error(`recommended: unknown scenario ${sc}`);
  if (id !== null && !cm.options[id]) throw new Error(`recommended ${sc}: unknown option ${id}`);
}

const t0 = Date.now();
const data = { seeds: { official: OFFICIAL, strict: STRICT }, business: biz, scenarios: {} };
for (const sc of REFERENCE_SCENARIOS) {
  const base = await runScenario({ scenario: sc, levers: {}, seeds: allSeeds, rates, fgValue: biz.fgValuePerUnit });
  const entry = { baseline: { official: summarise(pick(base.runs, OFFICIAL)), strict: summarise(pick(base.runs, STRICT)) }, options: {} };
  for (const [id, o] of Object.entries(cm.options)) {
    const opt = await runScenario({ scenario: sc, levers: o.levers, seeds: allSeeds, rates, fgValue: biz.fgValuePerUnit });
    const official = officialCheck(pick(base.runs, OFFICIAL), pick(opt.runs, OFFICIAL));
    const strict = strictCheck(pick(base.runs, STRICT), pick(opt.runs, STRICT), official);
    const sOff = summarise(pick(opt.runs, OFFICIAL));
    const oneTime = opt.pricing.total;
    const shifts = biz.periodShifts;
    const profitGain = sOff.totalProfit - entry.baseline.official.totalProfit;
    const grossGainPerShift = (profitGain + oneTime * shifts / AMORTISATION_SHIFTS) / shifts;  // before amortisation
    entry.options[id] = {
      label: o.label, levers: o.levers, description: describeLevers(o.levers, DEFAULT_CONFIG), pricing: opt.pricing,
      official: sOff, strict: summarise(pick(opt.runs, STRICT)), check: { official, strict },
      profitGain, paybackShifts: oneTime === 0 ? null : grossGainPerShift > 0 ? oneTime / grossGainPerShift : Infinity,
    };
  }
  data.scenarios[sc.id] = entry;
  process.stdout.write(`${sc.id} done\n`);
}

// Rule BIZ-04: highest profit (seeds 1–2) among the options that pass the strict check.
for (const sc of REFERENCE_SCENARIOS) {
  const e = data.scenarios[sc.id];
  const passing = Object.entries(e.options).filter(([, o]) => o.check.strict.pass);
  passing.sort((a, b) => b[1].official.totalProfit - a[1].official.totalProfit);
  e.bestByRule = passing.length ? passing[0][0] : null;
}

// Annual view (BIZ-01): weighted sum of 20-shift periods.
const annual = {};
for (const id of Object.keys(cm.options)) {
  const oneTime = data.scenarios[REFERENCE_SCENARIOS[0].id].options[id].pricing.total;
  let gain = 0;
  for (const [sc, w] of Object.entries(biz.annualMix)) gain += w * data.scenarios[sc].options[id].profitGain;
  const grossGain = gain + oneTime * biz.shiftsPerYear / AMORTISATION_SHIFTS;
  annual[id] = { oneTime, annualProfitGain: gain, paybackYears: oneTime === 0 ? null : grossGain > 0 ? oneTime / grossGain : Infinity };
}
data.annual = annual;

// ── Formatting ───────────────────────────────────────────────────────────────
const eur = (x) => Math.round(x).toLocaleString('en-US');
const p1 = (x) => (100 * x).toFixed(1);
const sign = (x, f) => (x >= 0 ? '+' : '') + f(x);
const payback = (x, unit) => (x === null ? '–' : x === Infinity ? 'not reached' : `${x < 10 ? x.toFixed(1) : Math.round(x)} ${unit}`);
const yesNo = (c) => (c.pass ? 'yes' : 'no');

// Countermeasure comparison
const cmpRows = [];
for (const sc of REFERENCE_SCENARIOS) {
  const e = data.scenarios[sc.id];
  for (const [id, o] of Object.entries(e.options)) {
    cmpRows.push({
      scenario: sc.id, option: id, label: o.label, oneTime: o.pricing.total,
      sl: o.official.serviceLevel, slGain: o.check.official.slGainPoints, good: o.official.goodPerShift,
      scrap: o.official.scrapRate, wip: o.official.avgWip, cpu: o.official.costPerGoodUnit, profit: o.official.totalProfit,
      profitGain: o.profitGain, payback: o.paybackShifts, official: o.check.official, strict: o.check.strict,
    });
  }
}
const cmpMd = [
  '# Countermeasure comparison',
  '',
  `Generated by \`npm run scenarios\`. ${biz.periodShifts} shifts per scenario. Numbers are averages of seeds ${OFFICIAL.join(' and ')} (official); "Strict" uses seeds ${STRICT[0]}–${STRICT.at(-1)}. Rates from \`data/rate_card.csv\`; one-time costs amortised over ${AMORTISATION_SHIFTS} shifts. Profit includes finished-goods holding and the lost-sales penalty.`,
  '',
  '| Scenario | Option | One-time cost (EUR) | SL (%) | Δ SL (points) | Good/shift | Scrap (%) | WIP | Cost/good unit (EUR) | Profit (EUR) | Δ profit (EUR) | Payback | Official check | Strict check |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...REFERENCE_SCENARIOS.flatMap((sc) => {
    const b = data.scenarios[sc.id].baseline.official;
    return [
      `| ${sc.id} | *no countermeasure* | 0 | ${p1(b.serviceLevel)} | – | ${b.goodPerShift.toFixed(1)} | ${p1(b.scrapRate)} | ${b.avgWip.toFixed(1)} | ${b.costPerGoodUnit.toFixed(1)} | ${eur(b.totalProfit)} | – | – | – | – |`,
      ...cmpRows.filter((r) => r.scenario === sc.id).map((r) =>
        `| ${r.scenario} | ${r.label} | ${eur(r.oneTime)} | ${p1(r.sl)} | ${sign(r.slGain, (x) => x.toFixed(1))} | ${r.good.toFixed(1)} | ${p1(r.scrap)} | ${r.wip.toFixed(1)} | ${r.cpu.toFixed(1)} | ${eur(r.profit)} | ${sign(r.profitGain, eur)} | ${payback(r.payback, 'shifts')} | ${r.official.evidence} | ${yesNo(r.strict)} |`),
    ];
  }),
  '',
  '## Best option by rule BIZ-04',
  '',
  'Highest total profit (seeds 1 and 2) among the options that pass the strict check. The recommended option per scenario is set in `config/countermeasures.json`.',
  '',
  '| Scenario | Best by rule | Recommended in config |',
  '|---|---|---|',
  ...REFERENCE_SCENARIOS.map((sc) => {
    const best = data.scenarios[sc.id].bestByRule, rec = cm.recommended[sc.id];
    return `| ${sc.id} | ${best ? cm.options[best].label : 'none (no option passes)'} | ${rec ? cm.options[rec].label : 'none'} |`;
  }),
  '',
  '## Annual view',
  '',
  `Assumption BIZ-01: a year is ${Object.entries(biz.annualMix).map(([k, v]) => `${v} × "${k}"`).join(' + ')} periods of ${biz.periodShifts} shifts. Payback = one-time cost ÷ annual profit gain before amortisation.`,
  '',
  '**Read with care (BIZ-02, COST-05):** every period here starts from an empty line, and stock options get their starting stock for free in every period. That overstates both the problem of the plain line and the value of stock. Use these numbers as an upper bound until the longer warm-start runs are available.',
  '',
  '| Option | One-time cost (EUR) | Annual Δ profit (EUR) | Payback |',
  '|---|---|---|---|',
  ...Object.entries(annual).map(([id, a]) => `| ${cm.options[id].label} | ${eur(a.oneTime)} | ${sign(a.annualProfitGain, eur)} | ${payback(a.paybackYears, 'years')} |`),
  '',
].join('\n');

// Scenario results (without / with recommended)
const resRows = [];
for (const sc of REFERENCE_SCENARIOS) {
  const e = data.scenarios[sc.id];
  const rec = cm.recommended[sc.id];
  const without = e.baseline.official;
  const withRec = rec ? e.options[rec] : null;
  resRows.push({ scenario: sc.id, variant: 'without', countermeasure: 'none', s: without, verified: '–' });
  resRows.push({
    scenario: sc.id, variant: 'with', countermeasure: rec ? withRec.label : 'none (no verified countermeasure)',
    s: rec ? withRec.official : without, verified: rec ? `${withRec.check.official.evidence}; strict: ${yesNo(withRec.check.strict)}` : '–',
  });
}
const warnings = REFERENCE_SCENARIOS
  .filter((sc) => cm.recommended[sc.id] && !data.scenarios[sc.id].options[cm.recommended[sc.id]].check.official.pass)
  .map((sc) => `Warning: the recommended option for ${sc.id} does not pass the official check.`);
const resMd = [
  '# Scenario results',
  '',
  `Generated by \`npm run scenarios\` from \`config/countermeasures.json\` (recommended option per scenario). Seeds ${OFFICIAL.join(' and ')}, averages; ${biz.periodShifts} shifts; empty line and empty stock at the start unless the countermeasure adds stock.`,
  '',
  '| Scenario | Countermeasure | Seeds | Throughput (good/shift) | Service level (%) | WIP | Scrap rate (%) | Cost/good unit (EUR) | Cost/good unit excl. FG holding (EUR) | Total profit (EUR) | Verified |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...resRows.map((r) => `| ${r.scenario} | ${r.countermeasure} | ${OFFICIAL.join(', ')} | ${r.s.goodPerShift.toFixed(1)} | ${p1(r.s.serviceLevel)} | ${r.s.avgWip.toFixed(1)} | ${p1(r.s.scrapRate)} | ${r.s.costPerGoodUnit.toFixed(1)} | ${r.s.costPerGoodUnitExFg.toFixed(1)} | ${eur(r.s.totalProfit)} | ${r.verified} |`),
  '',
  'Limits: 20-shift horizon from an empty line; no breakdowns; starting stock is charged and credited at EUR 103 (COST-04, COST-05); see docs/ASSUMPTIONS.md.',
  ...(cm._recommended_status ? ['', `Status of the recommendation: ${cm._recommended_status}`] : []),
  ...(warnings.length ? ['', ...warnings] : []),
  '',
].join('\n');

const csv = (rows) => rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n';
const cmpCsv = csv([
  ['scenario', 'option', 'label', 'one_time_cost_eur', 'service_level', 'sl_gain_points', 'good_per_shift', 'scrap_rate', 'avg_wip', 'cost_per_good_unit_eur', 'total_profit_eur', 'profit_gain_eur', 'payback_shifts', 'official_check', 'strict_check'],
  ...cmpRows.map((r) => [r.scenario, r.option, r.label, r.oneTime, r.sl.toFixed(4), r.slGain.toFixed(2), r.good.toFixed(2), r.scrap.toFixed(4), r.wip.toFixed(2), r.cpu.toFixed(2), r.profit.toFixed(2), r.profitGain.toFixed(2), r.payback === null ? '' : r.payback === Infinity ? 'not reached' : r.payback.toFixed(1), r.official.evidence, yesNo(r.strict)]),
]);
const resCsv = csv([
  ['scenario', 'variant', 'countermeasure', 'seeds', 'good_per_shift', 'service_level', 'avg_wip', 'scrap_rate', 'cost_per_good_unit_eur', 'cost_per_good_unit_excl_fg_eur', 'total_profit_eur', 'verified'],
  ...resRows.map((r) => [r.scenario, r.variant, r.countermeasure, OFFICIAL.join(' '), r.s.goodPerShift.toFixed(2), r.s.serviceLevel.toFixed(4), r.s.avgWip.toFixed(2), r.s.scrapRate.toFixed(4), r.s.costPerGoodUnit.toFixed(2), r.s.costPerGoodUnitExFg.toFixed(2), r.s.totalProfit.toFixed(2), r.verified]),
]);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'countermeasure-comparison.md'), cmpMd);
fs.writeFileSync(path.join(outDir, 'countermeasure-comparison.csv'), cmpCsv);
fs.writeFileSync(path.join(outDir, 'scenario-results.md'), resMd);
fs.writeFileSync(path.join(outDir, 'scenario-results.csv'), resCsv);
fs.writeFileSync(path.join(outDir, 'scenarios.json'), JSON.stringify(data, (k, v) => (v === Infinity ? 'not reached' : v), 2));
console.log(resMd);
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)} s. Wrote results/scenario-results.*, results/countermeasure-comparison.*, results/scenarios.json`);
