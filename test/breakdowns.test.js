// Machine breakdowns (docs/ASSUMPTIONS.md MAC-01 to MAC-10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SimulationEngine, normaliseBreakdowns } from '../src/simulation/engine.js';
import { DEFAULT_CONFIG } from '../src/simulation/config.js';
import { DEFAULT_FAILURE_MODES } from '../src/simulation/failureModes.js';
import { parseCsv } from '../src/economics/rateCard.js';
import { runHeadless } from '../src/headless/run.js';
import { REFERENCE_OUTAGE, demandFor, configFor } from '../src/scenarios/reference.js';
import { ALL_SCENARIOS } from '../src/scenarios/own.js';

const flat = Array(200).fill(34);

function engineWith(breakdowns, seed = 1) {
  const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  cfg.source.materialStock = -1;
  cfg.seed = seed;
  cfg.breakdowns = breakdowns;
  return new SimulationEngine(cfg);
}
const tickN = (engine, n) => { for (let i = 0; i < n; i++) engine._tick(); };

test('the built-in failure modes equal data/failure_rates.csv', () => {
  const [header, ...rows] = parseCsv(fs.readFileSync(new URL('../data/failure_rates.csv', import.meta.url), 'utf8'));
  const col = (name) => header.indexOf(name);
  const fromCsv = rows.map((r) => ({
    mode: r[col('mode')], station: r[col('suggested_station')],
    probabilityPerPart: Number(r[col('probability_per_part')]), repairTicks: Number(r[col('assumed_repair_time_ticks')]),
  }));
  assert.deepEqual(DEFAULT_FAILURE_MODES.map(({ description, ...m }) => m), fromCsv);
});

test('breakdowns are off by default: no failures and availability 1', async () => {
  const r = await runHeadless({ seed: 1, shifts: 20, demand: flat });
  assert.equal(r.kpis.failures, 0);
  assert.ok(Object.values(r.kpis.machines).every((m) => m.oee.availability === 1));
  assert.ok(!r.events.some((e) => e.type === 'machine_failure'));
});

test('M3 is available about 93% of the time and fails about 2.1% of parts (MAC-01 to MAC-03)', async () => {
  const cfg = configFor({ breakdowns: true });
  const avail = [], perPart = [];
  for (const seed of [1, 2, 3]) {
    const engine = engineWith(cfg.breakdowns, seed);
    tickN(engine, 480 * 100);
    const m3 = engine.machines.find((m) => m.id === 'M3');
    avail.push(1 - m3.ticksDown / engine.tick);
    perPart.push(m3.failures / m3.partsProcessed);
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(mean(avail) > 0.915 && mean(avail) < 0.95, `M3 availability ${mean(avail)}`);
  assert.ok(mean(perPart) > 0.016 && mean(perPart) < 0.027, `M3 failures per part ${mean(perPart)}`);
});

test('a machine is DOWN for exactly the repair time and keeps its part (MAC-03, MAC-04)', () => {
  const engine = engineWith({ enabled: true });
  tickN(engine, 480 * 20);
  const f = engine.getFailureLog().find((x) => x.machine === 'M3');
  assert.ok(f, 'M3 failed at least once in 20 shifts');
  const rows = engine.getHistory().filter((row) => row.tick >= f.tick && row.tick < f.tick + f.repairTicks + 1);
  const down = rows.filter((row) => row.M3_state === 'DOWN');
  assert.equal(down.length, f.repairTicks);
  assert.ok(down.every((row) => row.M3_currentPartId !== ''), 'the part stays in the machine during repair');
  assert.notEqual(rows.at(-1).M3_state, 'DOWN', 'running again after the repair');
});

test('the same seed gives the same failures; reset replays them', () => {
  const a = engineWith({ enabled: true }), b = engineWith({ enabled: true });
  tickN(a, 5000); tickN(b, 5000);
  assert.deepEqual(a.getFailureLog(), b.getFailureLog());
  const first = JSON.stringify(a.getFailureLog());
  a.reset(); tickN(a, 5000);
  assert.equal(JSON.stringify(a.getFailureLog()), first);
});

test('breakdowns do not change the reject decisions of M2 (separate random streams, SIM-02)', () => {
  const m1Only = { enabled: true, modes: DEFAULT_FAILURE_MODES.filter((m) => m.station === 'M1') };
  const scrapAfter = (engine, n) => engine.getHistory().find((row) => row.M2_partsProcessed >= n)?.scrapPartsReceived;
  const off = engineWith(null), on = engineWith(m1Only);
  tickN(off, 6000); tickN(on, 6000);
  assert.ok(on.getFailureLog().length > 0, 'M1 failed');
  for (const n of [50, 100, 200, 300]) assert.equal(scrapAfter(on, n), scrapAfter(off, n), `scrap after ${n} parts at M2`);
});

test('repairTimeFactor scales repair times (MAC-03 sensitivity)', () => {
  const engine = engineWith({ enabled: true, repairTimeFactor: 2 });
  tickN(engine, 480 * 20);
  const byMode = Object.fromEntries(DEFAULT_FAILURE_MODES.map((m) => [m.mode, m.repairTicks * 2]));
  assert.ok(engine.getFailureLog().length > 0);
  assert.ok(engine.getFailureLog().every((f) => f.repairTicks === byMode[f.mode]));
});

test('the event log reports failures and OEE availability falls below 1', async () => {
  const r = await runHeadless({ config: configFor({ breakdowns: true }), seed: 1, shifts: 20, demand: flat });
  const failures = r.events.filter((e) => e.type === 'machine_failure');
  assert.ok(failures.length > 0);
  assert.ok(failures.every((e) => e.machine && e.mode && e.ticks > 0 && e.shift >= 1));
  assert.equal(r.kpis.failures, failures.length);
  assert.ok(r.kpis.machines.M3.oee.availability < 1);
  assert.ok(r.kpis.goodPerShift < 36, 'breakdowns cost capacity');
});

test('engine outage = helper outage also with breakdowns on', async () => {
  const demand = demandFor('profile');
  const withHelper = await runHeadless({ config: configFor({ breakdowns: true }), seed: 1, shifts: 20, demand, outage: REFERENCE_OUTAGE });
  const withEngine = await runHeadless({ config: configFor({ breakdowns: true, outage: REFERENCE_OUTAGE }), seed: 1, shifts: 20, demand });
  assert.deepEqual(withEngine.perShift, withHelper.perShift);
  assert.deepEqual(withEngine.events, withHelper.events);
});

test('breakdowns can be switched on at run time and invalid settings are rejected', () => {
  const engine = engineWith(null);
  engine.updateConfig({ breakdowns: { enabled: true } });
  assert.equal(engine.getState().breakdowns.enabled, true);
  tickN(engine, 480 * 10);
  assert.ok(engine.getFailureLog().length > 0);
  assert.throws(() => normaliseBreakdowns({ repairTimeFactor: 0 }));
  assert.throws(() => normaliseBreakdowns({ modes: [{ mode: 'X', station: 'M1', probabilityPerPart: 2, repairTicks: 5 }] }));
  assert.throws(() => engine.updateConfig({ breakdowns: 'yes' }));
});

test('own scenarios: four reference scenarios with breakdowns and a 60-shift quarter', () => {
  const own = ALL_SCENARIOS.filter((s) => s.own);
  assert.deepEqual(own.map((s) => s.id), ['baseline-bd', 'supplier-outage-bd', 'demand-swing-bd', 'both-bd', 'quarter-60']);
  assert.ok(own.every((s) => s.breakdowns && configFor(s).breakdowns.enabled));
  assert.equal(own.at(-1).shifts, 60);
  assert.ok(ALL_SCENARIOS.filter((s) => !s.own).every((s) => !configFor(s).breakdowns?.enabled), 'reference scenarios stay without breakdowns');
});
