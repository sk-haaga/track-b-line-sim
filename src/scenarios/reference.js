/**
 * reference.js
 * The four reference scenarios of the Track B data README, kept unchanged so
 * results stay comparable between teams. The outage uses the engine setting
 * config.source.outage (our implementation), not the helper's own option.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDemand } from '../headless/run.js';
import { DEFAULT_CONFIG } from '../simulation/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEMAND_PROFILE_PATH = path.join(here, '..', '..', 'demand_profile.csv');

export const SHIFTS = 20;                                         // horizon of every reference scenario
export const REFERENCE_OUTAGE = { startTick: 4800, endTick: 5760 }; // 960 ticks from the first tick of shift 11 (SUP-01)
export const REFERENCE_SEEDS = [1, 2];                            // official seeds (SIM-01)

export function demandFor(kind) {
  if (kind === 'flat34') return Array(60).fill(34);
  if (kind === 'profile') return readDemand(DEMAND_PROFILE_PATH);
  throw new Error(`unknown demand kind: ${kind}`);
}

// referenceServiceLevel and tolerance from the data README and the brief (SIM-05).
export const REFERENCE_SCENARIOS = [
  { id: 'baseline',        demand: 'flat34',  outage: null,             referenceServiceLevel: 1.00, tolerance: 0.02 },
  { id: 'supplier-outage', demand: 'flat34',  outage: REFERENCE_OUTAGE, referenceServiceLevel: 0.76, tolerance: 0.05 },
  { id: 'demand-swing',    demand: 'profile', outage: null,             referenceServiceLevel: 0.57, tolerance: 0.02 },
  { id: 'both',            demand: 'profile', outage: REFERENCE_OUTAGE, referenceServiceLevel: 0.48, tolerance: 0.05 },
];

// The default line with the scenario's outage (and, for our own scenarios, breakdowns) written into the engine config.
export function configFor(scenario, base = DEFAULT_CONFIG) {
  const cfg = JSON.parse(JSON.stringify(base));
  cfg.source.outage = scenario.outage ? { ...scenario.outage } : null;
  if (scenario.breakdowns) {
    cfg.breakdowns = { ...(cfg.breakdowns ?? {}), enabled: true, ...(typeof scenario.breakdowns === 'object' ? scenario.breakdowns : {}) };
  }
  return cfg;
}
