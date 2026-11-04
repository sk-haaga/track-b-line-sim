/**
 * summarise.js
 * Turns one simulation run (runHeadless result) into a short, numbered fact sheet for the AI shift advisor.
 * The raw event log has about 1,000 entries per run (mostly short starved/blocked episodes of M4), so the model never
 * sees it (assumption ADV-02). Every fact has an ID (F1, F2, ...) that the advisor must cite; code checks the IDs.
 * Deterministic: the same run always gives the same facts.
 */
import { TICKS_PER_SHIFT } from '../headless/run.js';

const pct = (x) => `${(100 * x).toFixed(0)}%`;
const r1 = (x) => Math.round(x * 10) / 10;

// [1,2,3,5,7,8] → "1–3, 5, 7–8"
export function ranges(nums) {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i]}` : `${s[i]}–${s[j]}`);
    i = j;
  }
  return out.join(', ');
}

/**
 * summariseRun(result, { scenario, levers, initialFinishedGoods, config, version }) → { facts: [{ id, topic, text }], factIds }
 *   config   the line's configuration (for the settings fact)
 *   version  'v1' (first version), 'v2' (adds demand during the outage, the timing of late units and the load) or
 *            'v3' (v2 + a constraint fact that compares machine capacity with the supply instead of assuming the busiest
 *            machine is the limit)
 */
export function summariseRun(result, { scenario = {}, levers = {}, initialFinishedGoods = 0, config = null, version = 'v1' } = {}) {
  const { perShift, kpis, events } = result;
  const shifts = perShift.length;
  const facts = [];
  const add = (topic, text) => { const id = `F${facts.length + 1}`; facts.push({ id, topic, text }); return id; };

  // 1. Headline KPIs
  const onTime = perShift.reduce((s, r) => s + r.shippedOnTime, 0);
  add('kpis', `Over ${shifts} shifts: service level ${pct(kpis.serviceLevel)} (${onTime} of ${kpis.ordered} ordered units shipped on time); `
    + `${r1(kpis.goodPerShift)} good parts per shift; scrap ${kpis.scrap} of ${kpis.released} released parts (${pct(kpis.scrap / Math.max(1, kpis.released))}); `
    + `average WIP ${kpis.avgWip}; backlog at the end ${kpis.backlogEnd}; finished-goods stock at the end ${kpis.finishedGoodsEnd}.`);

  // 2. Starting conditions and current settings
  add('setup', `Starting finished-goods stock ${initialFinishedGoods}; the line starts empty. Current lever changes: ${Object.keys(levers).length ? JSON.stringify(levers) : 'none (default line)'}. `
    + `Machine breakdowns ${scenario.breakdowns ? 'on' : 'off'}.`);

  // 2b. Line settings (so the model knows the current values of every lever)
  if (config) {
    add('settings', `Line settings: cycle times ${config.machines.map((m) => `${m.id} ${m.cycleTime} min`).join(', ')}; `
      + `reject rate ${config.machines.filter((m) => m.rejectRate).map((m) => `${m.id} ${pct(m.rejectRate)}`).join(', ') || 'none'}; `
      + `buffers ${config.buffers.map((b) => `${b.id} ${b.capacity}`).join(', ')}; source releases one part every ${config.source.interval} min.`);
  }

  // 3. Demand
  const orders = perShift.map((r) => r.orders);
  const avgOrders = orders.reduce((a, b) => a + b, 0) / shifts;
  const peak = perShift.filter((r) => r.orders > kpis.goodPerShift).map((r) => r.shift);
  add('demand', `Orders per shift ranged ${Math.min(...orders)}–${Math.max(...orders)} (average ${r1(avgOrders)}); `
    + (peak.length ? `orders exceeded the average output of ${r1(kpis.goodPerShift)} parts in shifts ${ranges(peak)}; ` : 'orders never exceeded the average output; ')
    + `first three shifts ordered ${orders.slice(0, 3).join(', ')}.`);

  // 4. Shortfalls and backlog
  const short = perShift.filter((r) => r.shippedOnTime < r.orders);
  if (short.length) {
    const worst = short.reduce((a, b) => (b.orders - b.shippedOnTime > a.orders - a.shippedOnTime ? b : a));
    const peakBacklog = perShift.reduce((a, b) => (b.backlog > a.backlog ? b : a));
    add('shortfall', `Shortfalls (orders not shipped on time) in shifts ${ranges(short.map((r) => r.shift))}: ${short.reduce((s, r) => s + r.orders - r.shippedOnTime, 0)} units in total; `
      + `worst shift ${worst.shift} (${worst.orders - worst.shippedOnTime} of ${worst.orders} late). Backlog peaked at ${peakBacklog.backlog} units after shift ${peakBacklog.shift}. `
      + `Late orders are served first, so a backlog also delays the following shifts.`);
  } else {
    add('shortfall', 'No shortfalls: every order was shipped on time.');
  }

  // 5. Supplier outage
  const os = events.find((e) => e.type === 'outage_start'), oe = events.find((e) => e.type === 'outage_end');
  if (os && oe) {
    const s0 = Math.floor(os.tick / TICKS_PER_SHIFT) + 1, s1 = Math.floor((oe.tick - 1) / TICKS_PER_SHIFT) + 1;
    const prod = perShift.filter((r) => r.shift >= s0 && r.shift <= s1 + 1).map((r) => `shift ${r.shift}: ${r.produced}`);
    const ordersDuring = perShift.filter((r) => r.shift >= s0 && r.shift <= s1).map((r) => r.orders);
    add('outage', `Supplier outage from tick ${os.tick} to ${oe.tick} (${oe.tick - os.tick} min, shifts ${s0}–${s1}): no parts released. Good parts produced ${prod.join(', ')}.`
      + (version !== 'v1' ? ` Orders in the outage shifts: ${ordersDuring.join(', ')} (average over all shifts ${r1(avgOrders)}).` : ''));
  }

  // v2: where the late units fall, and how loaded the line is on average
  if (version === 'v2' || version === 'v3') {
    const late = (r) => r.orders - r.shippedOnTime;
    const os2 = os && oe ? [Math.floor(os.tick / TICKS_PER_SHIFT) + 1, Math.floor((oe.tick - 1) / TICKS_PER_SHIFT) + 1] : null;
    const first = perShift.filter((r) => r.shift <= 5).reduce((s, r) => s + late(r), 0);
    const inOut = os2 ? perShift.filter((r) => r.shift >= os2[0] && r.shift <= os2[1] + 3).reduce((s, r) => s + late(r), 0) : 0;
    const total = perShift.reduce((s, r) => s + late(r), 0);
    add('timing', `Late units by period: ${first} in shifts 1–5 (the line and the stock start empty)`
      + (os2 ? `, ${inOut} in the outage shifts and the 3 shifts after (${os2[0]}–${os2[1] + 3})` : '')
      + `, ${total - first - inOut} elsewhere; ${total} in total.`);
    add('load', `Average orders ${r1(avgOrders)} per shift vs average output ${r1(kpis.goodPerShift)} good parts per shift: the line runs at ${pct(avgOrders / Math.max(0.1, kpis.goodPerShift))} of its output`
      + (avgOrders > kpis.goodPerShift ? ', so it cannot catch up: capacity is below demand.' : ', so capacity is enough on average; late orders come from timing, not from average capacity.'));
  }

  // 6. Per machine: utilisation, starved / blocked / down, failures
  const fails = events.filter((e) => e.type === 'machine_failure');
  for (const [id, m] of Object.entries(kpis.machines)) {
    const f = fails.filter((e) => e.machine === id);
    const byMode = Object.entries(f.reduce((a, e) => ((a[e.mode] = (a[e.mode] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ×${v}`).join(', ');
    const longStarved = events.filter((e) => e.type === 'machine_starved' && e.machine === id && e.ticks >= 60);
    const starvedShifts = ranges(longStarved.map((e) => e.shift));
    add('machine', `${id}: busy ${pct(m.utilisation)}, blocked ${pct(m.blocked)}, starved ${pct(m.starved)}`
      + (m.down ? `, down for repair ${pct(m.down)}` : '')
      + `; OEE ${pct(m.oee.value)} (availability ${pct(m.oee.availability)}).`
      + (f.length ? ` ${f.length} breakdowns (${byMode}), ${f.reduce((s, e) => s + e.ticks, 0)} min of repair, in shifts ${ranges(f.map((e) => e.shift))}.` : '')
      + (longStarved.length ? ` Starved for an hour or more in shifts ${starvedShifts}.` : ''));
  }

  // 7. Constraint
  const ms = Object.entries(kpis.machines);
  const [cid, c] = ms.reduce((a, b) => (b[1].utilisation > a[1].utilisation ? b : a));
  if (version === 'v3' && config) {
    // v3: compare the busiest station's capacity with what the supply can deliver, instead of assuming that the
    // busiest machine is the limit (v1/v2 blamed M3 even when it was waiting for parts).
    const station = config.machines.find((m) => m.id === cid);
    const parallel = config.machines.filter((m) => m.stationId === station.stationId).length;
    const capacity = (TICKS_PER_SHIFT / station.cycleTime) * parallel;
    const reject = config.machines.reduce((a, m) => a + (m.rejectRate ?? 0), 0);
    const supply = (TICKS_PER_SHIFT / config.source.interval) * (1 - reject);
    if (supply < capacity * 0.98) {
      add('constraint', `No machine limits the line: the supply does. The source (one part every ${config.source.interval} min) and the reject gate (${pct(reject)} rejected) deliver at most ${r1(supply)} good parts per shift, `
        + `below the ${r1(capacity)} parts per shift that ${cid}, the busiest machine, could handle; ${cid} is starved ${pct(c.starved)} of the time.`);
    } else {
      add('constraint', `${cid} is the constraint: it can handle ${r1(capacity)} parts per shift while the supply could deliver ${r1(supply)} good parts per shift; it is busy ${pct(c.utilisation)}, blocked ${pct(c.blocked)}, starved ${pct(c.starved)}`
        + (c.down ? `, down for repair ${pct(c.down)}` : '') + '. Machines before it are often blocked and machines after it are often starved: consequences of the constraint, not separate problems.');
    }
  } else {
    add('constraint', `${cid} is the busiest machine (${pct(c.utilisation)} busy, ${pct(c.blocked)} blocked): it limits the line's output. `
      + `Machines before it are often blocked and machines after it are often starved, which is a consequence of the constraint, not a separate problem.`);
  }

  return { facts, factIds: new Set(facts.map((f) => f.id)) };
}

export function factSheet(facts) {
  return facts.map((f) => `${f.id} [${f.topic}] ${f.text}`).join('\n');
}
