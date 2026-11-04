// Supplier outage in the engine (assumption SUP-01). The helper's own outage option is the reference: with the same
// configuration and seed, the engine outage must give exactly the same result (per-shift rows, KPIs, event log).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SimulationEngine, normaliseOutage } from '../src/simulation/engine.js';
import { DEFAULT_CONFIG } from '../src/simulation/config.js';
import { runHeadless } from '../src/headless/run.js';
import { REFERENCE_OUTAGE, demandFor, configFor } from '../src/scenarios/reference.js';

function infiniteEngine(outage) {
  const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  cfg.source.materialStock = -1;
  cfg.source.outage = outage;
  return new SimulationEngine(cfg);
}

for (const demandKind of ['flat34', 'profile']) {
  for (const seed of [1, 2]) {
    test(`engine outage = helper outage (${demandKind}, seed ${seed})`, async () => {
      const demand = demandFor(demandKind);
      const viaHelper = await runHeadless({ seed, shifts: 20, demand, outage: REFERENCE_OUTAGE });
      const viaEngine = await runHeadless({ config: configFor({ outage: REFERENCE_OUTAGE }), seed, shifts: 20, demand });
      assert.deepEqual(viaEngine.perShift, viaHelper.perShift);
      assert.deepEqual(viaEngine.kpis, viaHelper.kpis);
      assert.deepEqual(viaEngine.events, viaHelper.events);
    });
  }
}

test('no part is released on ticks startTick < n <= endTick, and the source counter is frozen', () => {
  const engine = infiniteEngine({ startTick: 100, endTick: 200 });
  const at = {};
  for (let n = 1; n <= 260; n++) {
    engine._tick();
    at[n] = { generated: engine.source.totalGenerated, counter: engine.source.ticksSinceLast, inOutage: engine.getState().source.inOutage };
  }
  assert.equal(at[101].generated, at[100].generated);
  assert.equal(at[200].generated, at[100].generated, 'nothing released during the outage');
  assert.equal(at[200].counter, at[100].counter, 'counter frozen during the outage');
  assert.ok(at[260].generated > at[200].generated, 'the source resumes after the outage');
  assert.equal(at[100].inOutage, false);
  assert.equal(at[101].inOutage, true);
  assert.equal(at[200].inOutage, true);
  assert.equal(at[201].inOutage, false);
});

test('an outage starves the line', () => {
  const engine = infiniteEngine({ startTick: 1000, endTick: 1960 });
  for (let n = 1; n <= 1960; n++) engine._tick();
  assert.ok(engine.machines.every((m) => m.state === 'STARVED' || m.state === 'IDLE'), 'all machines wait at the end of a long outage');
});

test('the outage can be set and cleared at run time', () => {
  const engine = infiniteEngine(null);
  engine.updateConfig({ outage: { startTick: 0, endTick: 50 } });
  for (let n = 1; n <= 50; n++) engine._tick();
  assert.equal(engine.source.totalGenerated, 0);
  engine.updateConfig({ outage: null });
  assert.equal(engine.getState().source.outage, null);
  for (let n = 51; n <= 100; n++) engine._tick();
  assert.ok(engine.source.totalGenerated > 0);
});

test('invalid outage settings are rejected', () => {
  assert.equal(normaliseOutage(null), null);
  assert.deepEqual(normaliseOutage({ startTick: 4800, endTick: 5760 }), { startTick: 4800, endTick: 5760 });
  assert.throws(() => normaliseOutage({ startTick: 10, endTick: 10 }));
  assert.throws(() => normaliseOutage({ startTick: -1, endTick: 10 }));
  assert.throws(() => normaliseOutage({ startTick: 'a', endTick: 10 }));
  assert.throws(() => new SimulationEngine({ ...DEFAULT_CONFIG, source: { ...DEFAULT_CONFIG.source, outage: { startTick: 5, endTick: 1 } } }));
});

test('reset keeps the configured outage', () => {
  const engine = infiniteEngine({ startTick: 10, endTick: 20 });
  engine.reset();
  assert.deepEqual(engine.getState().source.outage, { startTick: 10, endTick: 20 });
});
