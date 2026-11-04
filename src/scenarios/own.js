/**
 * own.js
 * Our own scenarios, added next to the four unchanged reference scenarios (brief: "add scenarios for your own
 * features"). IDs refer to docs/ASSUMPTIONS.md.
 *
 *   <reference>-bd   the reference scenario with machine breakdowns from data/failure_rates.csv (MAC-01 to MAC-08)
 *   quarter-60       the most realistic case: the full demand profile (60 shifts = one quarter at 240 shifts per year,
 *                    TIME-02), one reference outage (4 outages per year, SUP-02) and breakdowns. Starting stock is given
 *                    once per quarter instead of once per 20 shifts, so it is a fairer base for annual numbers (BIZ-02).
 */
import { REFERENCE_SCENARIOS, REFERENCE_OUTAGE } from './reference.js';

export const OWN_SCENARIOS = [
  ...REFERENCE_SCENARIOS.map((s) => ({
    id: `${s.id}-bd`, demand: s.demand, outage: s.outage, breakdowns: true, own: true,
    description: `${s.id} with machine breakdowns`,
  })),
  {
    id: 'quarter-60', demand: 'profile', outage: REFERENCE_OUTAGE, breakdowns: true, shifts: 60, own: true,
    description: 'full demand profile (60 shifts = one quarter), one outage in shift 11, breakdowns',
  },
];

export const ALL_SCENARIOS = [...REFERENCE_SCENARIOS, ...OWN_SCENARIOS];
