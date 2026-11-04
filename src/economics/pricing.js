/**
 * pricing.js
 * One-time cost of a countermeasure, derived from the lever changes and the rate card. The advisor does not price
 * its proposals (brief); this deterministic function does.
 *
 *   cycle time      ticks removed per machine x cycle_time_reduction_investment   (organiser assumption)
 *   reject rate     percentage points removed x reject_rate_reduction_investment (organiser assumption)
 *   buffer          slots added x extra_buffer_slot
 *   extra machine   machines added x parallel_machine_investment (amortised = the EUR 49.48/shift depreciation; the
 *                   station's hour rate is charged by the cost model because the machine exists in the run)
 *   source interval no investment (its cost shows up as material and holding)
 *   starting stock  no investment (charged and credited at EUR 103; only its holding cost counts)
 * Raising a cycle time or reject rate, or removing slots, earns no refund.
 */

export function priceLevers(baseConfig, levers, rates) {
  const items = [];
  const lv = levers ?? {};
  const add = (item, quantity, unitPrice, note) => {
    if (quantity > 0) items.push({ item, quantity, unitPrice, total: Math.round(quantity * unitPrice * 100) / 100, note });
  };
  for (const [id, v] of Object.entries(lv.cycleTime ?? {})) {
    const base = baseConfig.machines.find((m) => m.id === id).cycleTime;
    add('cycle_time_reduction_investment', Math.max(0, base - v), rates.cycle_time_reduction_investment, `${id} ${base}→${v} ticks`);
  }
  for (const [id, v] of Object.entries(lv.rejectRate ?? {})) {
    const base = baseConfig.machines.find((m) => m.id === id).rejectRate ?? 0;
    const points = Math.round((base - v) * 100 * 1e6) / 1e6;
    add('reject_rate_reduction_investment', Math.max(0, points), rates.reject_rate_reduction_investment, `${id} ${base * 100}→${v * 100}%`);
  }
  for (const [id, v] of Object.entries(lv.bufferCapacity ?? {})) {
    const base = baseConfig.buffers.find((b) => b.id === id).capacity;
    add('extra_buffer_slot', Math.max(0, v - base), rates.extra_buffer_slot, `${id} ${base}→${v} slots`);
  }
  for (const [st, v] of Object.entries(lv.parallelMachines ?? {})) {
    add('parallel_machine_investment', v, rates.parallel_machine_investment, `+${v} machine at ${st}`);
  }
  return { items, total: Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100 };
}
