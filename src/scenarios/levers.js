/**
 * levers.js
 * A countermeasure is a set of lever changes on top of a scenario's configuration. The same format is used by the
 * scenario runner (config/countermeasures.json) and later by the AI shift advisor.
 *
 *   {
 *     initialFinishedGoods: 40,            // starting finished-goods stock (units)
 *     cycleTime:        { M3: 12 },        // ticks, per original machine id
 *     rejectRate:       { M2: 0.05 },      // fraction 0..1, per machine id
 *     bufferCapacity:   { BUF2: 12 },      // parts, per buffer id
 *     sourceInterval:   10,                // ticks between released parts
 *     parallelMachines: { S3: 1 },         // extra machines per station id
 *   }
 *
 * Limits (docs/ASSUMPTIONS.md, LEV-01 to LEV-06) are checked by validateLevers().
 */

export const LEVER_LIMITS = {
  initialFinishedGoods: { min: 0, max: 60 },        // LEV-01
  cycleTimeMaxReduction: 3,                         // LEV-02: at most 3 ticks off any machine
  cycleTimeMin: 1,
  rejectRate: { min: 0.02, max: 0.5 },              // LEV-03 (increase allowed up to 50% for what-if tests)
  bufferCapacity: { min: 1, max: 20 },              // LEV-04
  sourceInterval: { min: 8, max: 60 },              // LEV-05
  parallelMachinesPerStation: 1,                    // LEV-06
};

const KNOWN = ['initialFinishedGoods', 'cycleTime', 'rejectRate', 'bufferCapacity', 'sourceInterval', 'parallelMachines'];
const SPAWN_SUFFIXES = ['b', 'c', 'd'];             // same naming as engine.spawnMachine: M3 → M3b

const isInt = (x) => Number.isInteger(x);

// Returns a list of human-readable problems; empty list = valid.
export function validateLevers(levers, baseConfig) {
  const errors = [];
  if (levers == null) return errors;
  if (typeof levers !== 'object' || Array.isArray(levers)) return ['levers must be an object'];
  for (const k of Object.keys(levers)) if (!KNOWN.includes(k)) errors.push(`unknown lever "${k}"`);

  const machines = new Map(baseConfig.machines.map((m) => [m.id, m]));
  const buffers = new Map(baseConfig.buffers.map((b) => [b.id, b]));
  const stations = new Set(baseConfig.machines.map((m) => m.stationId));
  const L = LEVER_LIMITS;

  if (levers.initialFinishedGoods !== undefined) {
    const v = levers.initialFinishedGoods;
    if (!isInt(v) || v < L.initialFinishedGoods.min || v > L.initialFinishedGoods.max) {
      errors.push(`initialFinishedGoods must be an integer ${L.initialFinishedGoods.min}..${L.initialFinishedGoods.max} (LEV-01)`);
    }
  }
  for (const [id, v] of Object.entries(levers.cycleTime ?? {})) {
    const m = machines.get(id);
    if (!m) { errors.push(`cycleTime: unknown machine ${id}`); continue; }
    const min = Math.max(L.cycleTimeMin, m.cycleTime - L.cycleTimeMaxReduction);
    if (!isInt(v) || v < min) errors.push(`cycleTime ${id} must be an integer >= ${min} (LEV-02: at most ${L.cycleTimeMaxReduction} ticks off ${m.cycleTime})`);
  }
  for (const [id, v] of Object.entries(levers.rejectRate ?? {})) {
    if (!machines.has(id)) { errors.push(`rejectRate: unknown machine ${id}`); continue; }
    if (typeof v !== 'number' || v < L.rejectRate.min || v > L.rejectRate.max) {
      errors.push(`rejectRate ${id} must be ${L.rejectRate.min}..${L.rejectRate.max} (LEV-03)`);
    }
  }
  for (const [id, v] of Object.entries(levers.bufferCapacity ?? {})) {
    if (!buffers.has(id)) { errors.push(`bufferCapacity: unknown buffer ${id}`); continue; }
    if (!isInt(v) || v < L.bufferCapacity.min || v > L.bufferCapacity.max) {
      errors.push(`bufferCapacity ${id} must be an integer ${L.bufferCapacity.min}..${L.bufferCapacity.max} (LEV-04)`);
    }
  }
  if (levers.sourceInterval !== undefined) {
    const v = levers.sourceInterval;
    if (!isInt(v) || v < L.sourceInterval.min || v > L.sourceInterval.max) {
      errors.push(`sourceInterval must be an integer ${L.sourceInterval.min}..${L.sourceInterval.max} (LEV-05)`);
    }
  }
  for (const [st, v] of Object.entries(levers.parallelMachines ?? {})) {
    if (!stations.has(st)) { errors.push(`parallelMachines: unknown station ${st}`); continue; }
    if (!isInt(v) || v < 0 || v > L.parallelMachinesPerStation) {
      errors.push(`parallelMachines ${st} must be an integer 0..${L.parallelMachinesPerStation} (LEV-06)`);
    }
  }
  return errors;
}

/**
 * applyLevers(config, levers) → { config, initialFinishedGoods }
 * Returns a new config (the input is not changed). Throws if the levers are invalid.
 * A parallel machine copies its station's original machine after the other levers are applied.
 */
export function applyLevers(config, levers = {}) {
  const errors = validateLevers(levers, config);
  if (errors.length) throw new Error(`invalid levers: ${errors.join('; ')}`);
  const cfg = JSON.parse(JSON.stringify(config));
  const lv = levers ?? {};

  for (const [id, v] of Object.entries(lv.cycleTime ?? {})) cfg.machines.find((m) => m.id === id).cycleTime = v;
  for (const [id, v] of Object.entries(lv.rejectRate ?? {})) cfg.machines.find((m) => m.id === id).rejectRate = v;
  for (const [id, v] of Object.entries(lv.bufferCapacity ?? {})) cfg.buffers.find((b) => b.id === id).capacity = v;
  if (lv.sourceInterval !== undefined) cfg.source.interval = lv.sourceInterval;

  for (const [st, count] of Object.entries(lv.parallelMachines ?? {})) {
    const original = cfg.machines.find((m) => m.stationId === st);
    const at = cfg.machines.indexOf(original);
    for (let i = 0; i < count; i++) {
      cfg.machines.splice(at + 1 + i, 0, { ...original, id: original.id + SPAWN_SUFFIXES[i] });
    }
  }
  return { config: cfg, initialFinishedGoods: lv.initialFinishedGoods ?? 0 };
}

// One-line description for tables and logs, e.g. "M3 cycle 13→12, FG stock 30".
export function describeLevers(levers, baseConfig) {
  if (!levers || Object.keys(levers).length === 0) return 'no change';
  const parts = [];
  for (const [id, v] of Object.entries(levers.cycleTime ?? {})) parts.push(`${id} cycle ${baseConfig.machines.find((m) => m.id === id)?.cycleTime}→${v} min`);
  for (const [id, v] of Object.entries(levers.rejectRate ?? {})) parts.push(`${id} reject ${Math.round((baseConfig.machines.find((m) => m.id === id)?.rejectRate ?? 0) * 100)}→${Math.round(v * 100)}%`);
  for (const [id, v] of Object.entries(levers.bufferCapacity ?? {})) parts.push(`${id} ${baseConfig.buffers.find((b) => b.id === id)?.capacity}→${v} slots`);
  if (levers.sourceInterval !== undefined) parts.push(`source every ${levers.sourceInterval} min`);
  for (const [st, v] of Object.entries(levers.parallelMachines ?? {})) if (v) parts.push(`+${v} machine at ${st}`);
  if (levers.initialFinishedGoods) parts.push(`FG stock ${levers.initialFinishedGoods}`);
  return parts.join(', ');
}
