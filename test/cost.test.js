// Cost model (data README cost rules; docs/ASSUMPTIONS.md COST-*).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, loadRateCard } from '../src/economics/rateCard.js';
import { computeCosts, rateKeyFor, AMORTISATION_SHIFTS } from '../src/economics/cost.js';
import { runHeadless } from '../src/headless/run.js';
import { demandFor } from '../src/scenarios/reference.js';

const rates = loadRateCard();

// A tiny hand-made result to check each formula exactly.
function fakeResult({ perShift, machines = ['M1', 'M2', 'M3', 'M4'], released = 0, goodParts = 1, ordered, finishedGoodsEnd = 0 }) {
  return {
    perShift,
    kpis: {
      machines: Object.fromEntries(machines.map((m) => [m, {}])),
      released, goodParts, ordered: ordered ?? perShift.reduce((s, r) => s + r.orders, 0), finishedGoodsEnd,
    },
  };
}
const row = (o) => ({ produced: 0, scrap: 0, orders: 0, shipped: 0, shippedOnTime: 0, backlog: 0, stock: 0, wip: 0, ...o });

test('parseCsv handles quoted fields with commas and doubled quotes', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,"x, y","say ""hi"""\r\n'), [['a', 'b', 'c'], ['1', 'x, y', 'say "hi"']]);
});

test('the rate card loads as numbers', () => {
  assert.equal(rates.machine_hour_rate_M3, 90);
  assert.equal(rates.material_cost_per_part, 38);
  assert.equal(rates.lost_sales_penalty, 90);
  assert.equal(rates.selling_price_per_good_unit, 180);
  assert.equal(rates.holding_cost_finished_goods, 0.5);
  assert.ok(Object.values(rates).every(Number.isFinite));
});

test('baseline check: the default line costs about EUR 102.8 per good unit (seeds 1 and 2)', async () => {
  const cpu = [];
  for (const seed of [1, 2]) {
    const r = await runHeadless({ seed, shifts: 20, demand: demandFor('flat34') });
    cpu.push(computeCosts(r, { rates }).costPerGoodUnitExFg);
  }
  const mean = (cpu[0] + cpu[1]) / 2;
  assert.ok(Math.abs(mean - 102.8) <= 0.5, `mean cost per good unit ${mean}`);
});

test('machine cost charges every scheduled hour, spawned machines at their station rate', () => {
  assert.equal(rateKeyFor('M3b'), 'machine_hour_rate_M3');
  const c = computeCosts(fakeResult({ perShift: [row({})], machines: ['M1', 'M2', 'M3', 'M3b', 'M4'] }), { rates });
  assert.equal(c.machineCost, (85 + 55 + 90 + 90 + 40) * 8);
});

test('material, WIP holding, lost sales and revenue', () => {
  const c = computeCosts(fakeResult({
    perShift: [row({ orders: 50, shipped: 40, shippedOnTime: 30, wip: 10 }), row({ orders: 50, shipped: 40, shippedOnTime: 40, wip: 5 })],
    released: 100,
  }), { rates });
  assert.equal(c.materialCost, 100 * 38);
  assert.equal(c.holdingWip, (10 + 5) * 0.3 * 8);
  assert.equal(c.lostSales, (100 - 70) * 90);
  assert.equal(c.revenue, 80 * 180);
});

test('finished-goods holding uses the README average-stock rule', () => {
  // shift 1: start 10 + half of 4 produced = 12; shift 2: stock after shift 1 (8) + half of 6 = 11 → 23 unit-shifts
  const c = computeCosts(fakeResult({ perShift: [row({ produced: 4, stock: 8 }), row({ produced: 6, stock: 2 })], finishedGoodsEnd: 2 }), { rates, initialFinishedGoods: 10 });
  assert.equal(c.holdingFg, 23 * 0.5 * 8);
  assert.equal(c.startStockValue, 10 * 103);
  assert.equal(c.endStockValue, 2 * 103);
});

test('one-time costs are amortised over 1,920 shifts', () => {
  const perShift = Array.from({ length: 20 }, () => row({}));
  const c = computeCosts(fakeResult({ perShift }), { rates, oneTimeCosts: 96000 });
  assert.equal(AMORTISATION_SHIFTS, 1920);
  assert.equal(c.amortisedOneTime, 96000 * 20 / 1920);
});

test('total profit is the sum of its parts', async () => {
  const r = await runHeadless({ seed: 1, shifts: 20, demand: demandFor('profile'), initialFinishedGoods: 30 });
  const c = computeCosts(r, { rates, initialFinishedGoods: 30, oneTimeCosts: 30000 });
  const sum = c.revenue - c.machineCost - c.materialCost - c.holdingWip - c.holdingFg - c.amortisedOneTime - c.lostSales - c.startStockValue + c.endStockValue;
  assert.ok(Math.abs(sum - c.totalProfit) < 0.05);
  assert.equal(c.shippedOnTime + c.lateUnits, r.kpis.ordered);
});
