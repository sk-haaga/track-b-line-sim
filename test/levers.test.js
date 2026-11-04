// Levers, their limits (LEV-*) and their one-time prices (rate card).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLevers, validateLevers, describeLevers } from '../src/scenarios/levers.js';
import { priceLevers } from '../src/economics/pricing.js';
import { loadRateCard } from '../src/economics/rateCard.js';
import { DEFAULT_CONFIG } from '../src/simulation/config.js';
import { runHeadless } from '../src/headless/run.js';

const rates = loadRateCard();
const base = DEFAULT_CONFIG;

test('applyLevers changes a copy and returns the starting stock', () => {
  const before = JSON.stringify(base);
  const { config, initialFinishedGoods } = applyLevers(base, {
    cycleTime: { M3: 12 }, rejectRate: { M2: 0.05 }, bufferCapacity: { BUF2: 12 }, sourceInterval: 10, initialFinishedGoods: 30,
  });
  assert.equal(JSON.stringify(base), before, 'input not changed');
  assert.equal(config.machines.find((m) => m.id === 'M3').cycleTime, 12);
  assert.equal(config.machines.find((m) => m.id === 'M2').rejectRate, 0.05);
  assert.equal(config.buffers.find((b) => b.id === 'BUF2').capacity, 12);
  assert.equal(config.source.interval, 10);
  assert.equal(initialFinishedGoods, 30);
});

test('a parallel machine copies its station original and works in parallel', async () => {
  const { config } = applyLevers(base, { cycleTime: { M3: 12 }, parallelMachines: { S3: 1 } });
  const m3b = config.machines.find((m) => m.id === 'M3b');
  assert.ok(m3b, 'M3b added');
  assert.equal(m3b.stationId, 'S3');
  assert.equal(m3b.cycleTime, 12, 'copied after the cycle-time lever');
  assert.equal(config.machines.indexOf(m3b), config.machines.findIndex((m) => m.id === 'M3') + 1);
  const r = await runHeadless({ config, seed: 1, shifts: 5, demand: Array(5).fill(34) });
  assert.ok(r.kpis.machines.M3b.utilisation > 0.3, 'M3b takes work');
});

test('validateLevers enforces the limits', () => {
  assert.deepEqual(validateLevers({}, base), []);
  const bad = (lv) => validateLevers(lv, base).length > 0;
  assert.ok(bad({ magic: 1 }));
  assert.ok(bad({ initialFinishedGoods: 61 }));
  assert.ok(bad({ initialFinishedGoods: 10.5 }));
  assert.ok(bad({ cycleTime: { M3: 9 } }), 'M3 at most 3 ticks faster (LEV-02)');
  assert.ok(!bad({ cycleTime: { M3: 10 } }));
  assert.ok(bad({ cycleTime: { M9: 5 } }));
  assert.ok(bad({ rejectRate: { M2: 0.01 } }), 'reject rate at least 2% (LEV-03)');
  assert.ok(bad({ bufferCapacity: { BUF2: 21 } }), 'at most 20 slots (LEV-04)');
  assert.ok(bad({ sourceInterval: 7 }), 'source at most every 8 min (LEV-05)');
  assert.ok(bad({ parallelMachines: { S3: 2 } }), 'at most 1 extra machine (LEV-06)');
  assert.ok(bad({ parallelMachines: { S9: 1 } }));
  assert.throws(() => applyLevers(base, { initialFinishedGoods: 100 }));
});

test('priceLevers prices each change from the rate card', () => {
  assert.equal(priceLevers(base, { cycleTime: { M3: 12 } }, rates).total, 30000);
  assert.equal(priceLevers(base, { cycleTime: { M3: 11 } }, rates).total, 60000);
  assert.equal(priceLevers(base, { rejectRate: { M2: 0.05 } }, rates).total, 40000);
  assert.equal(priceLevers(base, { bufferCapacity: { BUF2: 12 } }, rates).total, 900);
  assert.equal(priceLevers(base, { parallelMachines: { S3: 1 } }, rates).total, 95000);
  assert.equal(priceLevers(base, { initialFinishedGoods: 60, sourceInterval: 9 }, rates).total, 0);
  assert.equal(priceLevers(base, { cycleTime: { M3: 14 } }, rates).total, 0, 'slower is not refunded');
  const combo = priceLevers(base, { cycleTime: { M3: 12 }, bufferCapacity: { BUF2: 8 } }, rates);
  assert.equal(combo.total, 30300);
  assert.equal(combo.items.length, 2);
});

test('describeLevers gives a short label', () => {
  assert.equal(describeLevers({}, base), 'no change');
  assert.equal(describeLevers({ cycleTime: { M3: 12 }, initialFinishedGoods: 30 }, base), 'M3 cycle 13→12 min, FG stock 30');
});
