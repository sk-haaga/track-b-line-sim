/**
 * advisor.js
 * The AI shift advisor: "the LLM explains, the simulation decides".
 *
 *   1. run the scenario as it is (seeds 1–10) and summarise seed 1's run into numbered facts   (summarise.js)
 *   2. ask the model for a diagnosis and at most 3 proposals, citing fact IDs                     (prompt.js, llm.js)
 *   3. check every answer in code: valid JSON, known levers within their limits, cited facts exist (no invented facts)
 *   4. verify every valid proposal by re-running the simulation: official check (seeds 1–2) and strict check (1–10)
 *   5. if nothing is verified, send the simulation results back and let the model revise (at most maxRounds rounds)
 *   6. price verified proposals with the deterministic cost model (the advisor itself never prices)
 *   7. log every round (prompt version, model, tokens, seconds, proposals, checks) as one JSON line
 */
import fs from 'node:fs';
import path from 'node:path';
import { chat } from './llm.js';
import { summariseRun, factSheet } from './summarise.js';
import { SYSTEM_PROMPT, PROMPT_VERSION, userPrompt, feedbackPrompt } from './prompt.js';
import { runScenario } from '../scenarios/run.js';
import { officialCheck, strictCheck, summarise } from '../scenarios/verify.js';
import { validateLevers, describeLevers } from '../scenarios/levers.js';
import { DEFAULT_CONFIG } from '../simulation/config.js';

const MAX_PROPOSALS = 3;
const OFFICIAL = [1, 2];
const STRICT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const pick = (runs, seeds) => runs.filter((r) => seeds.includes(r.seed));

// Extracts the JSON object from a model answer (tolerates ```json fences and text around it).
export function parseAnswer(content) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  const text = fenced ? fenced[1] : content;
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in the answer');
  return JSON.parse(text.slice(start, end + 1));
}

// Code checks of an answer. Returns { answer, proposals: [{ levers, rationale, facts, errors }], errors }.
export function checkAnswer(answer, factIds, baseConfig = DEFAULT_CONFIG) {
  const errors = [];
  if (typeof answer?.diagnosis !== 'string' || !answer.diagnosis.trim()) errors.push('missing diagnosis');
  const citedIn = (list) => (Array.isArray(list) ? list : []).filter((id) => !factIds.has(id));
  for (const c of answer?.rootCauses ?? []) {
    const bad = citedIn(c.facts);
    if (bad.length) errors.push(`root cause "${c.cause}" cites unknown facts ${bad.join(', ')}`);
    if (!Array.isArray(c.facts) || c.facts.length === 0) errors.push(`root cause "${c.cause}" cites no facts`);
  }
  const mentioned = [...(answer?.diagnosis ?? '').matchAll(/\bF\d+\b/g)].map((m) => m[0]).filter((id) => !factIds.has(id));
  if (mentioned.length) errors.push(`diagnosis mentions unknown facts ${[...new Set(mentioned)].join(', ')}`);
  const raw = Array.isArray(answer?.proposals) ? answer.proposals : [];
  if (raw.length > MAX_PROPOSALS) errors.push(`${raw.length} proposals (at most ${MAX_PROPOSALS}); extra ones ignored`);
  const proposals = raw.slice(0, MAX_PROPOSALS).map((p) => {
    const e = validateLevers(p?.levers ?? {}, baseConfig);
    if (!p?.levers || Object.keys(p.levers).length === 0) e.push('no lever changes');
    const bad = citedIn(p?.facts);
    if (bad.length) e.push(`cites unknown facts ${bad.join(', ')}`);
    if (!Array.isArray(p?.facts) || p.facts.length === 0) e.push('cites no facts');
    return { levers: p?.levers ?? {}, rationale: p?.rationale ?? '', facts: p?.facts ?? [], expectedEffect: p?.expectedEffect ?? '', errors: e };
  });
  return { answer, proposals, errors };
}

export async function runAdvisor({
  scenario, rates, provider = 'organiser', model, temperature = 0.2, maxTokens = 1200, maxRounds = 2, timeoutMs = 60000,
  logFile = null, env, fetchImpl, now = () => new Date().toISOString(),
}) {
  // 1. The scenario as it is
  const base = await runScenario({ scenario, seeds: STRICT, rates, keepEvents: true });
  const seed1 = base.runs.find((r) => r.seed === 1);
  const { facts, factIds } = summariseRun({ perShift: seed1.perShift, kpis: seed1.kpis, events: seed1.events }, { scenario });
  const factText = factSheet(facts);
  const baseSummary = summarise(pick(base.runs, OFFICIAL));

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt({ scenario, factText }) }];
  const rounds = [];
  const verified = [];
  const tried = new Set();

  for (let round = 1; round <= maxRounds; round++) {
    // 2. Ask
    const call = await chat({ provider, model, messages, temperature, maxTokens, timeoutMs, env, fetchImpl });
    messages.push({ role: 'assistant', content: call.content });

    // 3. Check in code
    let checked;
    try {
      checked = checkAnswer(parseAnswer(call.content), factIds);
    } catch (err) {
      checked = { answer: null, proposals: [], errors: [`answer is not valid JSON: ${err.message}`] };
    }

    // 4. Verify by simulation
    const results = [];
    for (const p of checked.proposals) {
      const key = JSON.stringify(p.levers);
      if (p.errors.length) { results.push({ ...p, pass: false }); continue; }
      if (tried.has(key)) { results.push({ ...p, errors: ['already tried'], pass: false }); continue; }
      tried.add(key);
      const opt = await runScenario({ scenario, levers: p.levers, seeds: STRICT, rates });
      const official = officialCheck(pick(base.runs, OFFICIAL), pick(opt.runs, OFFICIAL));
      const strict = strictCheck(pick(base.runs, STRICT), pick(opt.runs, STRICT), official);
      const s = summarise(pick(opt.runs, OFFICIAL));
      const r = {
        ...p, description: describeLevers(p.levers, DEFAULT_CONFIG), pass: official.pass, evidence: official.evidence,
        slGainPoints: official.slGainPoints, goodChange: official.goodChange, scrapChange: official.scrapChange, wipChange: official.wipChange,
        reasons: official.reasons, strictPass: strict.pass, strictReasons: strict.reasons,
        serviceLevel: s.serviceLevel, avgWip: s.avgWip,
        // 6. priced by the deterministic cost model, never by the LLM
        oneTimeCost: opt.pricing.total, profitGain: s.totalProfit - baseSummary.totalProfit,
      };
      results.push(r);
      if (r.pass) verified.push({ ...r, round });
    }

    // 7. Log the round
    const entry = {
      time: now(), scenario: scenario.id, round, provider: call.provider, model: call.model, promptVersion: PROMPT_VERSION,
      tokens: call.usage, seconds: +call.seconds.toFixed(2), answerErrors: checked.errors,
      diagnosis: checked.answer?.diagnosis ?? null, rootCauses: checked.answer?.rootCauses ?? [],
      proposals: results.map((r) => ({
        levers: r.levers, facts: r.facts, errors: r.errors, pass: r.pass ?? false, evidence: r.evidence ?? null,
        slGainPoints: r.slGainPoints ?? null, goodChange: r.goodChange ?? null, scrapChange: r.scrapChange ?? null,
        wipChange: r.wipChange ?? null, strictPass: r.strictPass ?? null, oneTimeCost: r.oneTimeCost ?? null, profitGain: r.profitGain ?? null,
      })),
    };
    rounds.push({ ...entry, results, checked });
    if (logFile) {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    }

    // 5. Stop when something is verified, else feed the results back
    if (verified.length || results.length === 0) break;
    if (round < maxRounds) messages.push({ role: 'user', content: feedbackPrompt(results) });
  }

  const tokens = rounds.reduce((a, r) => a + (r.tokens.totalTokens ?? 0), 0);
  const seconds = rounds.reduce((a, r) => a + r.seconds, 0);
  const best = [...verified].sort((a, b) => (b.strictPass - a.strictPass) || (b.slGainPoints - a.slGainPoints))[0] ?? null;
  return { scenario: scenario.id, facts, baseline: baseSummary, rounds, verified, best, tokens, seconds };
}

// Markdown report for the plant manager and the jury.
export function reportMarkdown(r) {
  const last = [...r.rounds].reverse().find((x) => x.checked?.answer) ?? r.rounds.at(-1);
  const pct = (x) => `${(100 * x).toFixed(1)}%`;
  const lines = [
    `# Shift advisor report: ${r.scenario}`, '',
    `Model: ${r.rounds[0]?.model} (${r.rounds[0]?.provider}), prompt ${PROMPT_VERSION}; ${r.rounds.length} round(s); ${r.tokens} tokens; ${r.seconds.toFixed(1)} s for the model calls.`,
    `Without changes: service level ${pct(r.baseline.serviceLevel)}, ${r.baseline.goodPerShift.toFixed(1)} good parts per shift (seeds 1–2).`, '',
    '## Diagnosis', '', last?.diagnosis ?? '(no valid answer)', '',
    ...(last?.rootCauses?.length ? ['Root causes:', ...last.rootCauses.map((c) => `- ${c.cause} (${(c.facts ?? []).join(', ')})`), ''] : []),
    '## Proposals and how they were verified', '',
    '| Round | Proposal | Cited facts | Δ SL (points) | Good parts | Scrap rate | WIP | Official check | Strict check | One-time cost (EUR) | Δ profit (EUR) |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...r.rounds.flatMap((rd) => rd.results.map((p) => p.errors?.length
      ? `| ${rd.round} | ${JSON.stringify(p.levers)} | ${(p.facts ?? []).join(', ')} | – | – | – | – | rejected: ${p.errors.join('; ')} | – | – | – |`
      : `| ${rd.round} | ${p.description} | ${p.facts.join(', ')} | ${p.slGainPoints >= 0 ? '+' : ''}${p.slGainPoints.toFixed(1)} | ${p.goodChange >= 0 ? '+' : ''}${pct(p.goodChange)} | ${p.scrapChange >= 0 ? '+' : ''}${pct(p.scrapChange)} | ${p.wipChange >= 0 ? '+' : ''}${pct(p.wipChange)} | ${p.evidence} | ${p.strictPass ? 'yes' : 'no'} | ${Math.round(p.oneTimeCost).toLocaleString('en-US')} | ${Math.round(p.profitGain).toLocaleString('en-US')} |`)),
    '',
    `**Recommended:** ${r.best ? `${r.best.description} (+${r.best.slGainPoints.toFixed(1)} points service level, ${r.best.evidence}${r.best.strictPass ? ', passes the strict check' : ''})` : 'no proposal was verified'}.`, '',
    '## Facts given to the model', '', ...r.facts.map((f) => `- **${f.id}** ${f.text}`), '',
  ];
  return lines.join('\n');
}
