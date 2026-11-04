// Chat with the shift advisor about one run (src/advisor/chat.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAdvisor } from '../src/advisor/advisor.js';
import { askAdvisor, chatContext } from '../src/advisor/chat.js';
import { REFERENCE_SCENARIOS } from '../src/scenarios/reference.js';
import { loadRateCard } from '../src/economics/rateCard.js';

const rates = loadRateCard();
const both = REFERENCE_SCENARIOS.find((s) => s.id === 'both');
const ENV = { CLIENT_ID: 'id', CLIENT_SECRET: 'secret', LLM_BASE_URL: 'https://llm.example' };

test('the chat context holds the facts, the diagnosis and every verification result', async () => {
  const run = await runAdvisor({ scenario: both, rates, provider: 'mock' });
  const ctx = chatContext(run);
  assert.match(ctx, /^Scenario: both/);
  assert.ok(run.facts.every((f) => ctx.includes(`${f.id} `)));
  assert.match(ctx, /verified/);
  assert.match(ctx, /Recommended: FG stock 40/);
});

test('mock chat answers from the facts and names the recommendation', async () => {
  const run = await runAdvisor({ scenario: both, rates, provider: 'mock' });
  const r = await askAdvisor({ run, question: 'What happened during the supplier outage?', provider: 'mock' });
  assert.match(r.answer, /outage/i);
  assert.match(r.answer, /Recommended change/);
  assert.deepEqual(r.unknownFacts, []);
  await assert.rejects(askAdvisor({ run, question: '  ', provider: 'mock' }), /empty question/);
});

test('real chat sends only user/assistant messages with the context, and flags unknown facts', async () => {
  const run = await runAdvisor({ scenario: both, rates, provider: 'mock' });
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ data: { content: 'Stock covers the early peak (F5), see also F99.', usage: { totalTokens: 900 } } }) };
  };
  const r = await askAdvisor({ run, question: 'Why stock?', history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }], provider: 'organiser', model: 'gpt-4o', env: ENV, fetchImpl });
  const msgs = calls[0].messages;
  assert.ok(msgs.every((m) => m.role === 'user' || m.role === 'assistant'));
  assert.match(msgs[0].content, /Answer ONLY from the facts/);
  assert.match(msgs[0].content, /Facts:/);
  assert.equal(msgs.at(-1).content, 'Why stock?');
  assert.deepEqual(r.unknownFacts, ['F99']);
  assert.equal(r.tokens.totalTokens, 900);
});
