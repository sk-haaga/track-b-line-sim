// AI shift advisor: summariser, answer checks, LLM client (with a fake endpoint) and the verify loop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summariseRun, ranges } from '../src/advisor/summarise.js';
import { parseAnswer, checkAnswer, runAdvisor } from '../src/advisor/advisor.js';
import { chat, foldSystemMessages } from '../src/advisor/llm.js';
import { runScenario } from '../src/scenarios/run.js';
import { REFERENCE_SCENARIOS } from '../src/scenarios/reference.js';
import { loadRateCard } from '../src/economics/rateCard.js';

const rates = loadRateCard();
const both = REFERENCE_SCENARIOS.find((s) => s.id === 'both');
const ENV = { CLIENT_ID: 'id', CLIENT_SECRET: 'secret', LLM_BASE_URL: 'https://llm.example/' };

// A fake endpoint that replays answers and records the requests.
function fakeEndpoint(answers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const content = answers[Math.min(calls.length - 1, answers.length - 1)];
    return { ok: true, json: async () => ({ data: { content, usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 } } }) };
  };
  return { calls, fetchImpl };
}

test('ranges compresses shift lists', () => {
  assert.equal(ranges([1, 2, 3, 5, 7, 8]), '1–3, 5, 7–8');
});

test('the fact sheet is short, numbered and names the outage, the shortfalls and the constraint', async () => {
  const run = (await runScenario({ scenario: both, seeds: [1], rates, keepEvents: true })).runs[0];
  const { facts, factIds } = summariseRun(run, { scenario: both });
  assert.ok(facts.length >= 8 && facts.length <= 15, `${facts.length} facts`);
  assert.equal(factIds.size, facts.length);
  assert.ok(facts.some((f) => f.topic === 'outage' && /4800/.test(f.text)));
  assert.ok(facts.some((f) => f.topic === 'shortfall' && /shifts 1–/.test(f.text)));
  assert.ok(facts.some((f) => f.topic === 'constraint' && f.text.startsWith('M3')));
  assert.ok(facts.map((f) => f.text).join(' ').length < 4000, 'compact enough for a cheap model');
  assert.ok(run.events.length > 300, 'the raw log is much longer');
});

test('parseAnswer accepts JSON in code fences or with text around it', () => {
  assert.deepEqual(parseAnswer('Sure:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseAnswer('x {"a":2} y'), { a: 2 });
  assert.throws(() => parseAnswer('no json here'));
});

test('checkAnswer rejects invented facts, unknown levers and limits', () => {
  const ids = new Set(['F1', 'F2']);
  const c = checkAnswer({
    diagnosis: 'Because of F9.', rootCauses: [{ cause: 'x', facts: ['F7'] }],
    proposals: [
      { levers: { initialFinishedGoods: 40 }, facts: ['F1'] },
      { levers: { initialFinishedGoods: 500 }, facts: ['F1'] },
      { levers: { magic: 1 }, facts: ['F2'] },
      { levers: { cycleTime: { M3: 12 } }, facts: ['F99'] },
    ],
  }, ids);
  assert.ok(c.errors.some((e) => /unknown facts F7/.test(e)));
  assert.ok(c.errors.some((e) => /diagnosis mentions unknown facts F9/.test(e)));
  assert.ok(c.errors.some((e) => /at most 3/.test(e)));
  assert.deepEqual(c.proposals.map((p) => p.errors.length > 0), [false, true, true]);
});

test('the organiser client sends the right request and reads content and token usage', async () => {
  const { calls, fetchImpl } = fakeEndpoint(['{"ok":true}']);
  const r = await chat({ provider: 'organiser', model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], env: ENV, fetchImpl });
  assert.equal(calls[0].url, 'https://llm.example/api/v1/llm/chat');
  assert.equal(calls[0].init.headers['X-Client-ID'], 'id');
  assert.equal(calls[0].init.headers['X-Client-Secret'], 'secret');
  assert.equal(calls[0].body.model, 'gpt-4o-mini');
  assert.equal(calls[0].body.maxTokens, 1200);
  assert.equal(r.content, '{"ok":true}');
  assert.equal(r.usage.totalTokens, 1200);
  assert.ok(r.seconds >= 0);
  await assert.rejects(chat({ provider: 'organiser', messages: [], env: {} }), /missing CLIENT_ID/);
});

test('the mock advisor proposes, and the simulation verifies, finished-goods stock for "both"', async () => {
  const r = await runAdvisor({ scenario: both, rates, provider: 'mock' });
  assert.ok(r.best, 'something verified');
  assert.ok(r.best.slGainPoints > 20);
  assert.equal(r.rounds.length, 1);
  assert.ok(r.rounds[0].proposals.every((p) => p.oneTimeCost !== undefined), 'priced by the cost model');
});

test('a model that invents facts is rejected, gets the results back and can revise', async () => {
  const bad = JSON.stringify({ diagnosis: 'Machine M9 broke (F42).', rootCauses: [{ cause: 'M9', facts: ['F42'] }],
    proposals: [{ levers: { initialFinishedGoods: 99 }, facts: ['F42'] }, { levers: { sourceInterval: 11 }, facts: ['F1'] }] });
  const good = JSON.stringify({ diagnosis: 'Late orders at the start (F4).', rootCauses: [{ cause: 'empty start', facts: ['F4'] }],
    proposals: [{ levers: { initialFinishedGoods: 60 }, facts: ['F4'], rationale: 'buffer' }] });
  const { calls, fetchImpl } = fakeEndpoint([bad, good]);
  const r = await runAdvisor({ scenario: both, rates, provider: 'organiser', model: 'test-model', env: ENV, fetchImpl, maxRounds: 3 });
  assert.equal(r.rounds.length, 2);
  assert.ok(r.rounds[0].answerErrors.some((e) => /F42/.test(e)));
  assert.ok(r.rounds[0].proposals[0].errors.length > 0, 'stock 99 is above the limit');
  assert.equal(r.rounds[0].proposals[1].pass, false, 'source interval 11 = no change, not verified');
  assert.match(calls[1].body.messages.at(-1).content, /None of them was verified/);
  assert.equal(r.best.levers.initialFinishedGoods, 60);
  assert.equal(r.tokens, 2400, 'tokens of both calls are logged');
});

test('system instructions are folded into the first user message (endpoint accepts only user/assistant)', async () => {
  const folded = foldSystemMessages([{ role: 'system', content: 'RULES' }, { role: 'user', content: 'FACTS' }, { role: 'assistant', content: 'A' }]);
  assert.deepEqual(folded.map((m) => m.role), ['user', 'assistant']);
  assert.match(folded[0].content, /^RULES[\s\S]*FACTS$/);
  const { calls, fetchImpl } = fakeEndpoint(['{}']);
  await chat({ provider: 'organiser', messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }], env: ENV, fetchImpl });
  assert.ok(calls[0].body.messages.every((m) => m.role === 'user' || m.role === 'assistant'));
});
