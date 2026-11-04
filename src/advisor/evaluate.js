/**
 * evaluate.js
 * Scores the shift advisor on the planted-fault test set (src/advisor/evalCases.js). Metrics per case:
 *   topCauseHit     the first-ranked root cause has a primary category
 *   anyCauseHit     some root cause has a primary category
 *   falseCauses     categories named that are neither primary nor secondary for the case
 *   citationValid   share of cited fact IDs that exist
 *   validProposals  share of proposals that pass the code checks (levers, limits, citations)
 *   rootFix         a valid proposal uses a lever that removes the primary cause (stock alone only covers symptoms)
 *   solved          a proposal was verified by the simulation (healthy case: no proposal = solved)
 *   slGain / regret best verified service-level gain, and the gap to the best gain the oracle found
 *   rounds, tokens, seconds
 * The oracle is a brute-force search over a fixed grid of lever changes (no LLM): the best the levers can do.
 */
import { runAdvisor } from './advisor.js';
import { CAUSE_CATEGORIES } from './prompt.js';
import { runScenario, scenarioConfig } from '../scenarios/run.js';
import { officialCheck } from '../scenarios/verify.js';
import { validateLevers } from '../scenarios/levers.js';

// Keyword fallback for answers without an explicit category (prompt v1). Order matters only for readability.
const KEYWORDS = [
  ['outage', /outage|supplier (stop|halt|fail)|no parts (were )?released/i],
  ['supply_rate', /source (interval|releases|too slow)|release rate|parts are released too slowly|slow (source|supply)|supply rate/i],
  ['breakdowns', /breakdown|failure|repair|broke|down time|downtime/i],
  ['quality_scrap', /scrap|reject|quality/i],
  ['no_stock', /empty (line|stock|start)|no (finished[- ]goods )?stock|starting stock|start(s|ed)? empty|no buffer of finished/i],
  ['demand_peak', /demand|peak|large orders|high orders|orders exceed/i],
  ['bottleneck_capacity', /bottleneck|constraint|limits (the )?(line'?s? )?output|capacity|too slow/i],
  ['none', /no problem|nothing was late|all orders .*on time/i],
];

export function categorise(cause) {
  if (cause?.category && CAUSE_CATEGORIES.includes(cause.category)) return [cause.category];
  const text = `${cause?.cause ?? ''}`;
  return KEYWORDS.filter(([, re]) => re.test(text)).map(([c]) => c);
}

// The answer of the last round that produced a valid JSON answer.
function finalAnswer(run) {
  return [...run.rounds].reverse().find((r) => r.checked?.answer)?.checked.answer ?? null;
}

export function scoreCase(evalCase, run, oracleGain) {
  const answer = finalAnswer(run);
  const causes = answer?.rootCauses ?? [];
  const cats = causes.map(categorise);
  const allowed = new Set([...evalCase.primary, ...evalCase.secondary]);
  const named = [...new Set(cats.flat())];
  const proposals = run.rounds.flatMap((r) => r.results ?? []);
  const cited = [...causes.flatMap((c) => c.facts ?? []), ...proposals.flatMap((p) => p.facts ?? [])];
  const factIds = new Set(run.facts.map((f) => f.id));
  const valid = proposals.filter((p) => !p.errors?.length);
  const healthy = evalCase.primary.includes('none');
  const slGain = run.best?.slGainPoints ?? 0;
  return {
    case: evalCase.id,
    topCauseHit: (cats[0] ?? []).some((c) => evalCase.primary.includes(c)),
    anyCauseHit: cats.some((cs) => cs.some((c) => evalCase.primary.includes(c))),
    falseCauses: named.filter((c) => !allowed.has(c)),
    citationValid: cited.length ? cited.filter((id) => factIds.has(id)).length / cited.length : 1,
    validProposals: proposals.length ? valid.length / proposals.length : 1,
    rootFix: healthy ? valid.length === 0 : valid.some((p) => Object.keys(p.levers).some((k) => evalCase.rootLevers.includes(k) && (k !== 'initialFinishedGoods' || evalCase.rootLevers.length === 1 || evalCase.rootLevers[0] === 'initialFinishedGoods'))),
    solved: healthy ? valid.length === 0 : !!run.best,
    proposals: proposals.length,
    slGain,
    oracleGain,
    regret: healthy ? 0 : Math.max(0, oracleGain - slGain),
    rounds: run.rounds.length,
    tokens: run.tokens,
    seconds: run.seconds,
    answer: answer ? { diagnosis: answer.diagnosis, rootCauses: causes.map((c, i) => ({ ...c, scoredAs: cats[i] })) } : null,
    tried: proposals.map((p) => ({ levers: p.levers, errors: p.errors, pass: p.pass ?? false, slGainPoints: p.slGainPoints ?? null })),
  };
}

// Fixed grid of candidate lever changes, relative to the case's line (planted faults included).
export function oracleCandidates(cfg) {
  const m3 = cfg.machines.find((m) => m.id === 'M3'), m2 = cfg.machines.find((m) => m.id === 'M2');
  const c = [
    { initialFinishedGoods: 20 }, { initialFinishedGoods: 40 }, { initialFinishedGoods: 60 },
    { cycleTime: { M3: m3.cycleTime - 1 } }, { cycleTime: { M3: m3.cycleTime - 2 } }, { cycleTime: { M3: Math.max(1, m3.cycleTime - 3) } },
    { rejectRate: { M2: 0.05 } }, { rejectRate: { M2: Math.max(0.02, m2.rejectRate - 0.05) } },
    { sourceInterval: Math.max(8, cfg.source.interval - 2) }, { sourceInterval: Math.max(8, cfg.source.interval - 3) },
    { bufferCapacity: { BUF2: 12 } }, { bufferCapacity: { BUF2: 20 } }, { parallelMachines: { S3: 1 } },
    { cycleTime: { M3: m3.cycleTime - 1 }, initialFinishedGoods: 30 },
  ];
  const seen = new Set();
  return c.filter((lv) => validateLevers(lv, cfg).length === 0 && !seen.has(JSON.stringify(lv)) && seen.add(JSON.stringify(lv)));
}

export async function oracleFor(evalCase, rates) {
  const base = await runScenario({ scenario: evalCase.scenario, seeds: [1, 2], rates });
  let best = { gain: 0, levers: null };
  for (const lv of oracleCandidates(scenarioConfig(evalCase.scenario))) {
    const opt = await runScenario({ scenario: evalCase.scenario, levers: lv, seeds: [1, 2], rates });
    const check = officialCheck(base.runs, opt.runs);
    if (check.pass && check.slGainPoints > best.gain) best = { gain: check.slGainPoints, levers: lv };
  }
  return best;
}

export async function evaluateAdvisor({ cases, rates, oracle, ...advisorOptions }) {
  const results = [];
  for (const c of cases) {
    const run = await runAdvisor({ scenario: c.scenario, rates, ...advisorOptions });
    results.push(scoreCase(c, run, oracle[c.id]?.gain ?? 0));
  }
  const mean = (k) => results.reduce((s, r) => s + Number(r[k]), 0) / results.length;
  return {
    results,
    summary: {
      cases: results.length,
      topCauseHit: mean('topCauseHit'), anyCauseHit: mean('anyCauseHit'),
      falseCausesPerCase: results.reduce((s, r) => s + r.falseCauses.length, 0) / results.length,
      citationValid: mean('citationValid'), validProposals: mean('validProposals'), rootFix: mean('rootFix'),
      solved: mean('solved'), meanRegret: mean('regret'), roundsPerCase: mean('rounds'),
      tokensPerCase: mean('tokens'), secondsPerCase: mean('seconds'),
    },
  };
}
