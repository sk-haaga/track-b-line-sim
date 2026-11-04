/**
 * verify.js
 * Checks whether a countermeasure is verified against the same scenario without it.
 *
 * Official rule (brief, SIM-03): service level rises by at least 2 points (average of seeds 1 and 2), and neither good
 * parts per shift nor the scrap rate gets worse by more than 10% (relative change, SIM-07). Gains of 2 to 3 points are
 * weak evidence. WIP is reported but is not a pass/fail criterion.
 *
 * Stricter rule (ours, SIM-04): the official rule passes, the average service-level gain over seeds 1–10 is still at
 * least 2 points, and total profit (average over seeds 1–10) does not fall.
 *
 * A "run" here is { seed, kpis, costs } as returned by runScenario().
 */

const EPS = 1e-9;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
export const scrapRate = (kpis) => kpis.scrap / Math.max(1, kpis.released);

export function summarise(runs) {
  return {
    seeds: runs.map((r) => r.seed),
    serviceLevel: mean(runs.map((r) => r.kpis.serviceLevel)),
    goodPerShift: mean(runs.map((r) => r.kpis.goodPerShift)),
    scrapRate: mean(runs.map((r) => scrapRate(r.kpis))),
    avgWip: mean(runs.map((r) => r.kpis.avgWip)),
    backlogEnd: mean(runs.map((r) => r.kpis.backlogEnd)),
    costPerGoodUnit: mean(runs.map((r) => r.costs.costPerGoodUnit)),
    costPerGoodUnitExFg: mean(runs.map((r) => r.costs.costPerGoodUnitExFg)),
    totalProfit: mean(runs.map((r) => r.costs.totalProfit)),
    lostSales: mean(runs.map((r) => r.costs.lostSales)),
  };
}

// Both lists must hold runs for the same seeds, in any order.
function pairUp(baseRuns, optRuns) {
  const seeds = baseRuns.map((r) => r.seed).sort((a, b) => a - b);
  const optSeeds = optRuns.map((r) => r.seed).sort((a, b) => a - b);
  if (JSON.stringify(seeds) !== JSON.stringify(optSeeds)) throw new Error(`seed mismatch: ${seeds} vs ${optSeeds}`);
}

export function officialCheck(baseRuns, optRuns) {
  pairUp(baseRuns, optRuns);
  const b = summarise(baseRuns), o = summarise(optRuns);
  const slGainPoints = (o.serviceLevel - b.serviceLevel) * 100;
  const goodChange = (o.goodPerShift - b.goodPerShift) / b.goodPerShift;
  const scrapChange = b.scrapRate > 0 ? (o.scrapRate - b.scrapRate) / b.scrapRate : (o.scrapRate > 0 ? Infinity : 0);
  const reasons = [];
  if (slGainPoints < 2 - EPS) reasons.push(`service level +${slGainPoints.toFixed(1)} points (needs +2)`);
  if (goodChange < -0.10 - EPS) reasons.push(`good parts per shift ${(goodChange * 100).toFixed(1)}% (limit -10%)`);
  if (scrapChange > 0.10 + EPS) reasons.push(`scrap rate +${(scrapChange * 100).toFixed(1)}% (limit +10%)`);
  const pass = reasons.length === 0;
  return {
    pass,
    evidence: !pass ? 'not verified' : slGainPoints < 3 ? 'weak (2–3 points)' : 'verified',
    slGainPoints, goodChange, scrapChange,
    wipChange: (o.avgWip - b.avgWip) / Math.max(EPS, b.avgWip),
    reasons,
  };
}

export function strictCheck(baseRuns, optRuns, official) {
  pairUp(baseRuns, optRuns);
  const b = summarise(baseRuns), o = summarise(optRuns);
  const slGainPoints = (o.serviceLevel - b.serviceLevel) * 100;
  const profitGain = o.totalProfit - b.totalProfit;
  const reasons = [];
  if (!official.pass) reasons.push('official check failed');
  if (slGainPoints < 2 - EPS) reasons.push(`seeds 1–${baseRuns.length}: service level +${slGainPoints.toFixed(1)} points`);
  if (profitGain < -EPS) reasons.push(`seeds 1–${baseRuns.length}: profit ${Math.round(profitGain)} EUR`);
  return { pass: reasons.length === 0, slGainPoints, profitGain, reasons };
}
