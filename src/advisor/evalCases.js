/**
 * evalCases.js
 * Planted-fault test set for the AI shift advisor (assumption EVAL-01). Each case plants one known problem (or none)
 * into the line, so the right diagnosis is known in advance:
 *   primary    the cause the advisor must find (any one of the listed categories counts)
 *   secondary  causes that are also true and may be named without penalty
 *   rootLevers levers that remove or directly mitigate the primary cause (finished-goods stock alone only covers
 *              symptoms, except where the cause is the empty start itself)
 * 20 shifts each, seeds 1–2 for the official check (like the reference scenarios).
 */
import { REFERENCE_OUTAGE } from '../scenarios/reference.js';

const M1_ONLY = [
  { mode: 'TWF', station: 'M1', probabilityPerPart: 0.0046, repairTicks: 20 },
  { mode: 'HDF', station: 'M1', probabilityPerPart: 0.0115, repairTicks: 45 },
];

export const EVAL_CASES = [
  {
    id: 'E01-start-peak', description: 'real demand, no outage: big orders hit an empty line',
    scenario: { id: 'E01-start-peak', demand: 'profile', outage: null },
    primary: ['demand_peak', 'no_stock'], secondary: ['bottleneck_capacity'], rootLevers: ['initialFinishedGoods'],
  },
  {
    id: 'E02-outage', description: 'flat demand 34, reference supplier outage',
    scenario: { id: 'E02-outage', demand: 'flat34', outage: REFERENCE_OUTAGE },
    primary: ['outage'], secondary: ['bottleneck_capacity', 'no_stock'], rootLevers: ['initialFinishedGoods', 'bufferCapacity'],
  },
  {
    id: 'E03-slow-m3', description: 'planted: M3 assembly slowed from 13 to 15 min',
    scenario: { id: 'E03-slow-m3', demand: 'flat34', outage: null, planted: { cycleTime: { M3: 15 } } },
    primary: ['bottleneck_capacity'], secondary: ['no_stock'], rootLevers: ['cycleTime', 'parallelMachines'],
  },
  {
    id: 'E04-high-reject', description: 'planted: M2 reject rate raised from 10% to 25%',
    scenario: { id: 'E04-high-reject', demand: 'flat34', outage: null, planted: { rejectRate: { M2: 0.25 } } },
    primary: ['quality_scrap'], secondary: ['no_stock', 'supply_rate'], rootLevers: ['rejectRate'],
  },
  {
    id: 'E05-slow-source', description: 'planted: source releases a part every 14 min instead of 11',
    scenario: { id: 'E05-slow-source', demand: 'flat34', outage: null, planted: { sourceInterval: 14 } },
    primary: ['supply_rate'], secondary: ['no_stock'], rootLevers: ['sourceInterval'],
  },
  {
    id: 'E06-m3-breakdowns', description: 'flat demand 34, breakdowns with doubled repair times',
    scenario: { id: 'E06-m3-breakdowns', demand: 'flat34', outage: null, breakdowns: { repairTimeFactor: 2 } },
    primary: ['breakdowns'], secondary: ['bottleneck_capacity', 'no_stock'], rootLevers: ['parallelMachines', 'cycleTime', 'initialFinishedGoods', 'bufferCapacity'],
  },
  {
    id: 'E07-m1-breakdowns', description: 'flat demand 34, only M1 breaks down, repairs four times as long',
    scenario: { id: 'E07-m1-breakdowns', demand: 'flat34', outage: null, breakdowns: { repairTimeFactor: 4, modes: M1_ONLY } },
    primary: ['breakdowns'], secondary: ['bottleneck_capacity', 'no_stock', 'supply_rate'], rootLevers: ['bufferCapacity', 'initialFinishedGoods'],
  },
  {
    id: 'E08-healthy', description: 'flat demand 28, nothing planted: no problem to find',
    scenario: { id: 'E08-healthy', demand: 'flat28', outage: null },
    primary: ['none'], secondary: [], rootLevers: [],
  },
  {
    id: 'E09-combined', description: 'real demand, outage and breakdowns together',
    scenario: { id: 'E09-combined', demand: 'profile', outage: REFERENCE_OUTAGE, breakdowns: true },
    primary: ['demand_peak', 'no_stock', 'outage', 'breakdowns'], secondary: ['bottleneck_capacity'], rootLevers: ['initialFinishedGoods'],
  },
  {
    id: 'E10-outage-in-quiet-period', description: 'reference "both": the outage falls in low-demand shifts, the start matters more',
    scenario: { id: 'E10-outage-in-quiet-period', demand: 'profile', outage: REFERENCE_OUTAGE },
    primary: ['demand_peak', 'no_stock'], secondary: ['outage', 'bottleneck_capacity'], rootLevers: ['initialFinishedGoods'],
  },
];
