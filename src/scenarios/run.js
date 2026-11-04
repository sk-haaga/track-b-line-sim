/**
 * run.js
 * runScenario: one scenario + one countermeasure (levers) over several seeds, with costs.
 * Used by scripts/run-scenarios.mjs and later by the AI shift advisor to verify its proposals.
 */
import { runHeadless } from '../headless/run.js';
import { DEFAULT_CONFIG } from '../simulation/config.js';
import { computeCosts, FG_VALUE_PER_UNIT, MARGINAL_FG_VALUE } from '../economics/cost.js';
import { priceLevers } from '../economics/pricing.js';
import { applyLevers } from './levers.js';
import { SHIFTS, demandFor, configFor } from './reference.js';

// The configuration a scenario starts from: the default line, the scenario's outage and breakdowns, and any planted
// fault (scenario.planted, same format as levers; used by the advisor evaluation, src/advisor/evalCases.js).
export function scenarioConfig(scenario, baseConfig = DEFAULT_CONFIG) {
  const cfg = configFor(scenario, baseConfig);
  return scenario.planted ? applyLevers(cfg, scenario.planted).config : cfg;
}

/**
 * runScenario({ scenario, levers, seeds, rates, baseConfig, fgValue, keepEvents })
 *   scenario   { id, demand: 'flat34' | 'profile', outage, shifts?, breakdowns? }
 * → { scenarioId, levers, pricing, runs: [{ seed, kpis, perShift, costs, events? }] }
 */
export async function runScenario({
  scenario, levers = {}, seeds = [1, 2], rates, baseConfig = DEFAULT_CONFIG, fgValue = FG_VALUE_PER_UNIT,
  marginalFgValue = MARGINAL_FG_VALUE, keepEvents = false,
}) {
  if (!rates) throw new Error('runScenario needs rates (loadRateCard())');
  const startConfig = scenarioConfig(scenario, baseConfig);
  const { config, initialFinishedGoods } = applyLevers(startConfig, levers);
  const pricing = priceLevers(startConfig, levers, rates);
  const demand = demandFor(scenario.demand);
  const shifts = scenario.shifts ?? SHIFTS;

  const runs = [];
  for (const seed of seeds) {
    const r = await runHeadless({ config, seed, shifts, demand, initialFinishedGoods });
    const costs = computeCosts(r, { rates, initialFinishedGoods, oneTimeCosts: pricing.total, fgValue, marginalFgValue });
    runs.push({ seed, kpis: r.kpis, perShift: r.perShift, costs, ...(keepEvents ? { events: r.events } : {}) });
  }
  return { scenarioId: scenario.id, levers, pricing, runs };
}
