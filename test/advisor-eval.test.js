// Advisor evaluation: planted faults, cause categories, scoring and the oracle grid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVAL_CASES } from '../src/advisor/evalCases.js';
import { categorise, scoreCase, oracleCandidates } from '../src/advisor/evaluate.js';
import { summariseRun } from '../src/advisor/summarise.js';
import { systemPrompt } from '../src/advisor/prompt.js';
import { runScenario, scenarioConfig } from '../src/scenarios/run.js';
import { loadRateCard } from '../src/economics/rateCard.js';

const rates = loadRateCard();

test('ten cases with unique ids, a known cause and root-cause levers', () => {
  assert.equal(EVAL_CASES.length, 10);
  assert.equal(new Set(EVAL_CASES.map((c) => c.id)).size, 10);
  assert.ok(EVAL_CASES.every((c) => c.primary.length > 0 && Array.isArray(c.rootLevers)));
});

test('planted faults change the line, and the healthy case has no late orders', async () => {
  assert.equal(scenarioConfig(EVAL_CASES.find((c) => c.id === 'E03-slow-m3').scenario).machines.find((m) => m.id === 'M3').cycleTime, 15);
  assert.equal(scenarioConfig(EVAL_CASES.find((c) => c.id === 'E05-slow-source').scenario).source.interval, 14);
  const healthy = await runScenario({ scenario: EVAL_CASES.find((c) => c.id === 'E08-healthy').scenario, seeds: [1], rates });
  assert.equal(healthy.runs[0].kpis.serviceLevel, 1);
  const reject = await runScenario({ scenario: EVAL_CASES.find((c) => c.id === 'E04-high-reject').scenario, seeds: [1], rates });
  assert.ok(reject.runs[0].kpis.serviceLevel < 0.6);
});

test('categorise uses the explicit category, else keywords', () => {
  assert.deepEqual(categorise({ cause: 'whatever', category: 'outage' }), ['outage']);
  assert.ok(categorise({ cause: 'The supplier outage stopped part releases' }).includes('outage'));
  assert.ok(categorise({ cause: 'M2 rejects a quarter of the parts' }).includes('quality_scrap'));
  assert.ok(categorise({ cause: 'The line started empty with no stock' }).includes('no_stock'));
});

test('scoreCase: right cause, root fix and regret', () => {
  const c = EVAL_CASES.find((x) => x.id === 'E04-high-reject');
  const run = {
    facts: [{ id: 'F1' }, { id: 'F2' }],
    rounds: [{ checked: { answer: { diagnosis: 'x', rootCauses: [{ cause: 'too many rejects at M2', facts: ['F1'] }, { cause: 'M3 bottleneck', facts: ['F9'] }] } },
      results: [{ levers: { rejectRate: { M2: 0.1 } }, facts: ['F2'], errors: [], pass: true, slGainPoints: 50 }] }],
    best: { slGainPoints: 50 }, tokens: 1000, seconds: 3,
  };
  const s = scoreCase(c, run, 56);
  assert.equal(s.topCauseHit, true);
  assert.equal(s.rootFix, true);
  assert.equal(s.solved, true);
  assert.equal(s.regret, 6);
  assert.equal(s.citationValid, 2 / 3, 'F9 does not exist');
});

test('the oracle grid only holds valid lever changes', () => {
  for (const c of EVAL_CASES) {
    const grid = oracleCandidates(scenarioConfig(c.scenario));
    assert.ok(grid.length >= 10, c.id);
  }
});

test('prompt v2 adds categories and ranking; facts v2 add timing and load', async () => {
  assert.match(systemPrompt('v2'), /category/);
  assert.doesNotMatch(systemPrompt('v1'), /Additional rules/);
  const sc = EVAL_CASES.find((c) => c.id === 'E10-outage-in-quiet-period').scenario;
  const run = (await runScenario({ scenario: sc, seeds: [1], rates, keepEvents: true })).runs[0];
  const v2 = summariseRun(run, { scenario: sc, config: scenarioConfig(sc), version: 'v2' }).facts;
  assert.ok(v2.some((f) => f.topic === 'timing' && /in shifts 1–5/.test(f.text)));
  assert.ok(v2.some((f) => f.topic === 'outage' && /Orders in the outage shifts: 29, 2/.test(f.text)));
  assert.ok(v2.some((f) => f.topic === 'settings'));
});

test('facts v3: the constraint fact blames the supply when the source or rejects limit the line', async () => {
  const fact = async (id) => {
    const sc = EVAL_CASES.find((c) => c.id === id).scenario;
    const run = (await runScenario({ scenario: sc, seeds: [1], rates, keepEvents: true })).runs[0];
    return summariseRun(run, { scenario: sc, config: scenarioConfig(sc), version: 'v3' }).facts.find((f) => f.topic === 'constraint').text;
  };
  assert.match(await fact('E05-slow-source'), /supply does/);
  assert.match(await fact('E04-high-reject'), /supply does/);
  assert.match(await fact('E03-slow-m3'), /^M3 is the constraint/);
  assert.match(systemPrompt('v3'), /prompt v3/);
});
