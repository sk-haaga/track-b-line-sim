/**
 * prompt.js
 * Prompts of the AI shift advisor. PROMPT_VERSION is logged with every call, so prompt changes can be compared.
 */
import { LEVER_LIMITS } from '../scenarios/levers.js';

export const PROMPT_VERSION = 'v1';   // default; see PROMPT_VERSIONS
export const PROMPT_VERSIONS = ['v1', 'v2'];
export const CAUSE_CATEGORIES = ['demand_peak', 'no_stock', 'outage', 'bottleneck_capacity', 'quality_scrap', 'supply_rate', 'breakdowns', 'none'];

const V1 = `You are the shift advisor of a 4-station production line that makes metal TV stand-and-frame sets:
Source → M1 machining (4 min) → M2 quality check (3 min, rejects ~10%) → M3 assembly (13 min) → M4 packing (2 min) → finished-goods stock → customer orders.
1 tick = 1 minute, 1 shift = 480 ticks. Orders of a shift are due at the end of that shift; late orders are served first.
Service level = units shipped on time / units ordered.

Your job: explain to the plant manager, in plain words, WHY orders were late, and propose at most 3 changes that should raise the service level.
Rules:
- Use only the numbered facts you are given. Cite the fact IDs (for example "F4") for every cause and every proposal. Never invent numbers.
- Separate the root cause from its consequences (a machine that is blocked or starved because of another one is not a root cause).
- Propose only these levers, within these limits:
  initialFinishedGoods: integer ${LEVER_LIMITS.initialFinishedGoods.min}..${LEVER_LIMITS.initialFinishedGoods.max} (starting finished-goods stock)
  cycleTime: { "<machine id>": integer ticks }, at most ${LEVER_LIMITS.cycleTimeMaxReduction} ticks below the current value
  rejectRate: { "M2": fraction ${LEVER_LIMITS.rejectRate.min}..${LEVER_LIMITS.rejectRate.max} }
  bufferCapacity: { "BUF0" | "BUF1" | "BUF2" | "BUF3": integer ${LEVER_LIMITS.bufferCapacity.min}..${LEVER_LIMITS.bufferCapacity.max} } (current values in the settings fact; BUF2 is in front of M3)
  sourceInterval: integer ${LEVER_LIMITS.sourceInterval.min}..${LEVER_LIMITS.sourceInterval.max} (minutes between released parts; current value in the settings fact)
  parallelMachines: { "<station id S1..S4>": 0..${LEVER_LIMITS.parallelMachinesPerStation} } (extra machine; M3 is station S3)
- Do not price proposals; the plant's cost model does that.
- Every proposal will be checked by re-running the simulation. It counts only if the service level rises by at least 2 points and good parts per shift and the scrap rate do not get worse by more than 10%.

Answer with JSON only, no other text:
{"diagnosis": "<3–5 plain sentences for the plant manager>",
 "rootCauses": [{"cause": "<short>", "facts": ["F.."]}],
 "proposals": [{"levers": {<lever changes>}, "rationale": "<1–2 sentences>", "facts": ["F.."], "expectedEffect": "<short, qualitative>"}]}`;

// v2 = v1 + lessons from the first real run (docs: README, "Advisor evaluation"):
//   rank causes by late units, label each with a category, treat an empty start as a cause, never list consequences,
//   consider every lever (not only stock), answer "none" when nothing was late.
const V2_RULES = `
Additional rules (prompt v2):
- Rank the root causes by how many late units they explain, most important first. Use the timing and load facts.
- Give every root cause one category from: ${CAUSE_CATEGORIES.join(', ')}.
  demand_peak = orders above output in some shifts; no_stock = the line and the finished-goods stock start empty;
  outage = supplier outage; bottleneck_capacity = the slowest machine is too slow for demand; quality_scrap = too many rejects;
  supply_rate = the source releases parts too slowly; breakdowns = machine failures; none = nothing was late.
- Blocked or starved machines are consequences, never root causes.
- First fix the root cause where a lever exists (for example a high reject rate → rejectRate, a slow source → sourceInterval,
  a too slow machine → cycleTime or parallelMachines); finished-goods stock only covers symptoms. Include at least one proposal
  that removes the main root cause if such a lever exists.
- If nothing was late, return rootCauses [{"cause": "no problem", "category": "none", "facts": [<kpi fact>]}] and no proposals.
Root cause format: {"cause": "<short>", "category": "<category>", "facts": ["F.."]}`;

export function systemPrompt(version = PROMPT_VERSION) {
  if (!PROMPT_VERSIONS.includes(version)) throw new Error(`unknown prompt version ${version}`);
  return version === 'v2' ? `${V1}\n${V2_RULES}` : V1;
}
export const SYSTEM_PROMPT = systemPrompt('v1');

export function userPrompt({ scenario, factText }) {
  return `Scenario "${scenario.id}"${scenario.description ? ` (${scenario.description})` : ''}.\nFacts:\n${factText}`;
}

export function feedbackPrompt(results) {
  const lines = results.map((r, i) => `Proposal ${i + 1} ${JSON.stringify(r.levers)}: `
    + (r.errors?.length ? `rejected before simulation: ${r.errors.join('; ')}`
      : `service level ${r.slGainPoints >= 0 ? '+' : ''}${r.slGainPoints.toFixed(1)} points, good parts ${(100 * r.goodChange).toFixed(1)}%, scrap rate ${(100 * r.scrapChange).toFixed(1)}% → ${r.pass ? 'VERIFIED' : 'NOT verified'}`));
  return `Simulation results for your proposals (average of 2 seeds):\n${lines.join('\n')}\n`
    + 'None of them was verified. Revise: propose up to 3 different changes, using the same JSON format. Cite facts as before.';
}
