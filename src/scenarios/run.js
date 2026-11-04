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
  const scenarioConfig = configFor(scenario, baseConfig);
  const { config, initialFinishedGoods } = applyLevers(scenarioConfig, levers);
  const pricing = priceLevers(scenarioConfig, levers, rates);
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
