// Verification rules: official (SIM-03, SIM-07) and strict (SIM-04).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { officialCheck, strictCheck } from '../src/scenarios/verify.js';
import { runScenario } from '../src/scenarios/run.js';
import { REFERENCE_SCENARIOS } from '../src/scenarios/reference.js';
import { loadRateCard } from '../src/economics/rateCard.js';

const run = (seed, { sl = 0.5, good = 36, scrap = 80, released = 800, wip = 10, profit = 1000 } = {}) => ({
  seed,
  kpis: { serviceLevel: sl, goodPerShift: good, scrap, released, avgWip: wip, backlogEnd: 0 },
  costs: { costPerGoodUnit: 100, costPerGoodUnitExFg: 100, totalProfit: profit, lostSales: 0 },
});
const pair = (o) => [run(1, o), run(2, o)];

test('a gain of exactly 2 points passes as weak evidence; 1.9 points fails', () => {
  const ok = officialCheck(pair({ sl: 0.50 }), pair({ sl: 0.52 }));
  assert.equal(ok.pass, true);
  assert.equal(ok.evidence, 'weak (2–3 points)');
  assert.equal(officialCheck(pair({ sl: 0.50 }), pair({ sl: 0.519 })).pass, false);
  assert.equal(officialCheck(pair({ sl: 0.50 }), pair({ sl: 0.60 })).evidence, 'verified');
});

test('the line compared with itself is never verified', () => {
  assert.equal(officialCheck(pair({}), pair({})).pass, false);
});

test('more than 10% fewer good parts or 10% more scrap rate fails; WIP does not count', () => {
  assert.equal(officialCheck(pair({}), pair({ sl: 0.6, good: 32 })).pass, false);          // -11%
  assert.equal(officialCheck(pair({}), pair({ sl: 0.6, good: 32.5 })).pass, true);         // -9.7%
  assert.equal(officialCheck(pair({}), pair({ sl: 0.6, scrap: 89 })).pass, false);         // scrap rate +11.25%
  assert.equal(officialCheck(pair({}), pair({ sl: 0.6, scrap: 87 })).pass, true);          // +8.75%
  assert.equal(officialCheck(pair({}), pair({ sl: 0.6, wip: 50 })).pass, true);
});

test('the strict check also needs profit not to fall', () => {
  const base = pair({ profit: 1000 }), opt = pair({ sl: 0.6, profit: 900 });
  const official = officialCheck(base, opt);
  assert.equal(official.pass, true);
  assert.equal(strictCheck(base, opt, official).pass, false);
  assert.equal(strictCheck(base, pair({ sl: 0.6, profit: 1100 }), official).pass, true);
});

test('runs must cover the same seeds', () => {
  assert.throws(() => officialCheck([run(1), run(2)], [run(1), run(3)]));
});

test('integration: 40 units of stock are verified in the demand-swing scenario', async () => {
  const rates = loadRateCard();
  const scenario = REFERENCE_SCENARIOS.find((s) => s.id === 'demand-swing');
  const base = await runScenario({ scenario, seeds: [1, 2], rates });
  const opt = await runScenario({ scenario, levers: { initialFinishedGoods: 40 }, seeds: [1, 2], rates });
  const check = officialCheck(base.runs, opt.runs);
  assert.equal(check.pass, true);
  assert.ok(check.slGainPoints > 20);
  assert.ok(strictCheck(base.runs, opt.runs, check).pass);
});
