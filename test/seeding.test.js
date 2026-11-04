// Seeded randomness (assumptions SIM-01, SIM-02): same seed → same run, reset replays, no Math.random.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, normaliseSeed, DEFAULT_SEED } from '../src/simulation/random.js';
import { SimulationEngine } from '../src/simulation/engine.js';
import { DEFAULT_CONFIG } from '../src/simulation/config.js';
import { runHeadless } from '../src/headless/run.js';

const flat = Array(60).fill(34);
const draw = (g, n) => Array.from({ length: n }, () => g());

test('normaliseSeed keeps 0 and falls back to the default for non-numbers', () => {
  assert.equal(normaliseSeed(0), 0);
  assert.equal(normaliseSeed(2), 2);
  assert.equal(normaliseSeed(undefined), DEFAULT_SEED);
  assert.equal(normaliseSeed(Number('abc')), DEFAULT_SEED);
});

test('a stream depends only on seed and name', () => {
  assert.deepEqual(draw(createRandom(1).stream('reject:M2'), 50), draw(createRandom(1).stream('reject:M2'), 50));
  assert.notDeepEqual(draw(createRandom(1).stream('reject:M2'), 50), draw(createRandom(2).stream('reject:M2'), 50));
  assert.notDeepEqual(draw(createRandom(0).stream('reject:M2'), 50), draw(createRandom(1).stream('reject:M2'), 50));
  assert.notDeepEqual(draw(createRandom(1).stream('reject:M2'), 50), draw(createRandom(1).stream('failure:M3'), 50));
});

test('drawing from one stream does not shift another stream', () => {
  const a = createRandom(7), b = createRandom(7);
  draw(a.stream('failure:M3'), 1000);                      // extra random process in run a only
  assert.deepEqual(draw(a.stream('reject:M2'), 50), draw(b.stream('reject:M2'), 50));
});

test('values lie in [0, 1) and are roughly uniform', () => {
  const xs = draw(createRandom(3).stream('x'), 20000);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.5) < 0.01, `mean ${mean}`);
});

test('the same seed gives the same headless run, a different seed a different one', async () => {
  const r1 = await runHeadless({ seed: 1, shifts: 20, demand: flat });
  const r1b = await runHeadless({ seed: 1, shifts: 20, demand: flat });
  const r2 = await runHeadless({ seed: 2, shifts: 20, demand: flat });
  const r0 = await runHeadless({ seed: 0, shifts: 20, demand: flat });
  assert.deepEqual(r1, r1b);
  assert.notDeepEqual(r1.perShift, r2.perShift);
  assert.notDeepEqual(r0.perShift, r1.perShift, 'seed 0 is a real seed, not swallowed as falsy');
});

test('reset() replays the run exactly', () => {
  const cfg = { ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)), seed: 5 };
  cfg.source.materialStock = -1;
  const engine = new SimulationEngine(cfg);
  for (let i = 0; i < 3000; i++) engine._tick();
  const first = { scrap: engine.scrapSink.partsReceived, good: engine.sink.partsReceived };
  engine.reset();
  for (let i = 0; i < 3000; i++) engine._tick();
  assert.deepEqual({ scrap: engine.scrapSink.partsReceived, good: engine.sink.partsReceived }, first);
  assert.ok(first.scrap > 0, 'the reject gate rejected some parts');
});

test('the seed set through updateConfig applies at the next reset and is reported in the state', () => {
  const engine = new SimulationEngine(DEFAULT_CONFIG);
  assert.equal(engine.getState().seed, DEFAULT_SEED);
  engine.updateConfig({ seed: 42 });
  assert.equal(engine.getState().seed, DEFAULT_SEED, 'not applied mid-run');
  engine.reset();
  assert.equal(engine.getState().seed, 42);
});

test('the engine never calls Math.random', async () => {
  const original = Math.random;
  Math.random = () => { throw new Error('Math.random called'); };
  try {
    await runHeadless({ seed: 1, shifts: 3, demand: flat });
  } finally {
    Math.random = original;
  }
});
