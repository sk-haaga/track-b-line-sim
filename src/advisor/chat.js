/**
 * chat.js
 * Follow-up questions to the shift advisor about one advisor run. The model gets only that run's numbered facts, its
 * diagnosis and the simulation results of every proposal, and must answer from them, citing fact IDs. It cannot change
 * the line: new ideas are answered as "run the advisor / the simulation to check it". Same providers as llm.js
 * ('organiser' or the offline 'mock'); every answer is logged with tokens and seconds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chat } from './llm.js';

export const CHAT_SYSTEM = `You are the shift advisor of a 4-station production line for metal TV stands (M1 machining, M2 quality check,
M3 assembly, M4 packing). The plant manager asks follow-up questions about one advisor run.
Rules:
- Answer ONLY from the facts and the verification results below. Cite fact IDs like (F4). Never invent numbers.
- Verification results are simulation re-runs: "verified" means the service level rose by at least 2 points with output and scrap held.
- If the answer is not in the context, say so and suggest which scenario or change to simulate.
- You cannot change the line. Never claim a change works unless it was verified below.
- Plain words, at most 6 sentences, no JSON.`;

export function chatContext(run) {
  const last = [...run.rounds].reverse().find((r) => r.checked?.answer);
  const lines = run.rounds.flatMap((rd) => rd.results.map((p) => p.errors?.length
    ? `- round ${rd.round}: ${JSON.stringify(p.levers)} rejected before simulation (${p.errors.join('; ')})`
    : `- round ${rd.round}: ${p.description}: service level ${p.slGainPoints >= 0 ? '+' : ''}${p.slGainPoints.toFixed(1)} points, `
      + `good parts ${(100 * p.goodChange).toFixed(1)}%, scrap rate ${(100 * p.scrapChange).toFixed(1)}%, ${p.evidence}; `
      + `strict check ${p.strictPass ? 'passed' : 'failed'}; one-time cost EUR ${Math.round(p.oneTimeCost)}, profit change EUR ${Math.round(p.profitGain)} per run`));
  return [
    `Scenario: ${run.scenario}. Without changes: service level ${(100 * run.baseline.serviceLevel).toFixed(1)}%, ${run.baseline.goodPerShift.toFixed(1)} good parts per shift.`,
    'Facts:', ...run.facts.map((f) => `${f.id} ${f.text}`),
    `Diagnosis: ${last?.checked.answer.diagnosis ?? '(none)'}`,
    'Proposals and simulation results:', ...(lines.length ? lines : ['- none']),
    `Recommended: ${run.best ? run.best.description : 'nothing was verified'}.`,
  ].join('\n');
}

// Offline answer: the facts whose words overlap the question most, plus the recommendation.
export function mockAnswer(question, run) {
  const words = question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const scored = run.facts.map((f) => ({ f, s: words.filter((w) => f.text.toLowerCase().includes(w)).length })).sort((a, b) => b.s - a.s);
  const top = scored.filter((x) => x.s > 0).slice(0, 2).map((x) => `${x.f.text} (${x.f.id})`);
  return (top.length ? `From the facts: ${top.join(' ')}` : 'The facts of this run do not answer that directly.')
    + ` Recommended change: ${run.best ? `${run.best.description}, verified at ${run.best.slGainPoints >= 0 ? '+' : ''}${run.best.slGainPoints.toFixed(1)} points` : 'none was verified'}. (Offline mock answer.)`;
}

export async function askAdvisor({ run, question, history = [], provider = 'organiser', model, temperature = 0.2, maxTokens = 600, logFile = null, env, fetchImpl }) {
  if (!question?.trim()) throw new Error('empty question');
  const q = question.trim().slice(0, 1000);
  let answer, usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, seconds = 0, usedModel = 'mock-rules';
  if (provider === 'mock') {
    answer = mockAnswer(q, run);
  } else {
    const messages = [
      { role: 'system', content: `${CHAT_SYSTEM}\n\nContext:\n${chatContext(run)}` },
      ...history.slice(-6).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) })),
      { role: 'user', content: q },
    ];
    const r = await chat({ provider, model, messages, temperature, maxTokens, env, fetchImpl });
    answer = r.content.trim(); usage = r.usage; seconds = r.seconds; usedModel = r.model;
  }
  const cited = [...new Set([...answer.matchAll(/\bF\d+\b/g)].map((m) => m[0]))];
  const known = new Set(run.facts.map((f) => f.id));
  const entry = { time: new Date().toISOString(), scenario: run.scenario, provider, model: usedModel, question: q, answer, cited,
    unknownFacts: cited.filter((id) => !known.has(id)), tokens: usage, seconds: +seconds.toFixed(2) };
  if (logFile) { fs.mkdirSync(path.dirname(logFile), { recursive: true }); fs.appendFileSync(logFile, JSON.stringify(entry) + '\n'); }
  return entry;
}
