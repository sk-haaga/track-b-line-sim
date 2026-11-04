/**
 * failureModes.js
 * Default machine failure modes, copied from data/failure_rates.csv (AI4I 2020; repair times are organiser
 * assumptions). The engine stays free of file access, so the values live here; test/breakdowns.test.js checks that
 * they still equal the CSV, so the two cannot drift apart.
 *
 *   station   'M1' / 'M3' = the station of that machine (spawned parallel machines such as M3b fail the same way);
 *             'any' = every station (MAC-02)
 *   probabilityPerPart  chance that the machine fails when it finishes a part (MAC-01)
 *   repairTicks         fixed repair time in ticks (MAC-03)
 */
export const DEFAULT_FAILURE_MODES = [
  { mode: 'TWF', description: 'Tool wear failure',           station: 'M1',  probabilityPerPart: 0.0046, repairTicks: 20 },
  { mode: 'HDF', description: 'Heat dissipation failure',    station: 'M1',  probabilityPerPart: 0.0115, repairTicks: 45 },
  { mode: 'PWF', description: 'Power failure',               station: 'M3',  probabilityPerPart: 0.0095, repairTicks: 30 },
  { mode: 'OSF', description: 'Overstrain failure',          station: 'M3',  probabilityPerPart: 0.0098, repairTicks: 60 },
  { mode: 'RNF', description: 'Random failure (any station)', station: 'any', probabilityPerPart: 0.0019, repairTicks: 15 },
];
