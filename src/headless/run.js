// runHeadless: run the machine_sim engine without the UI or wall-clock timers and apply the Track B order rules.
//
// It finds the engine in ../simulation (src/simulation of the starter repo), else in $MACHINE_SIM/src/simulation if set.
//
//   const result = await runHeadless({
//     config,                 // simulation config; default DEFAULT_CONFIG. The helper always runs with infinite material (materialStock -1)
//     seed,                   // stored as config.seed; has an effect once you implement seeding (seeded reject gate)
//     shifts: 20,
//     demand,                 // array: orders per shift (the `orders` column of demand_profile.csv), at least `shifts` long
//     outage: { startTick: 4800, endTick: 5760 },   // optional: the source stops in this window
//     initialFinishedGoods: 0,
//   });
//   // result = { perShift: [...], kpis: {...}, events: [...] }
//
// Order rules (same as the Track B README): orders of shift s are due at the end of shift s, served from finished-goods
// stock, oldest orders first; what cannot be shipped stays in the backlog. Service level = units shipped on or before
// their due tick / units ordered.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export const TICKS_PER_SHIFT = 480;          // 1 tick = 1 minute, 1 shift = 8 hours
const NEVER = 1e9;                           // source interval used to halt the source
const MIN_EPISODE = 10;                      // starved/blocked episodes shorter than this many ticks are not reported

async function loadEngine() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, '../simulation')];                     // inside the starter repo (src/headless)
  if (process.env.MACHINE_SIM) candidates.push(path.join(process.env.MACHINE_SIM, 'src/simulation'));
  const dir = candidates.find((d) => fs.existsSync(path.join(d, 'engine.js')));
  if (!dir) {
    throw new Error(`machine_sim engine not found (looked for engine.js in: ${candidates.join(', ')}). `
      + 'Keep this file in src/headless/ of the starter repository, or set MACHINE_SIM=/path/to/machine_sim');
  }
  const [{ SimulationEngine }, { DEFAULT_CONFIG }] = await Promise.all([
    import(pathToFileURL(path.join(dir, 'engine.js'))),
    import(pathToFileURL(path.join(dir, 'config.js'))),
  ]);
  return { SimulationEngine, DEFAULT_CONFIG };
}

export async function runHeadless({
  config, seed = 0, shifts = 20, demand, outage = null, initialFinishedGoods = 0,
} = {}) {
  if (!Array.isArray(demand) || demand.length < shifts) throw new Error('demand must have at least `shifts` entries');
  const { SimulationEngine, DEFAULT_CONFIG } = await loadEngine();
  const cfg = JSON.parse(JSON.stringify(config ?? DEFAULT_CONFIG));
  cfg.source.materialStock = -1;                              // always infinite: use the outage for supply problems
  cfg.seed = seed;
  const engine = new SimulationEngine(cfg);
  const sourceInterval = cfg.source.interval;

  const perShift = [];
  let stock = initialFinishedGoods, backlog = 0, ordered = 0, onTime = 0, lastGood = 0, lastScrap = 0;
  const events = [];
  // outage window: the helper's own option, or the engine setting cfg.source.outage = { startTick, endTick } that you implement in the engine
  const marker = outage ?? cfg.source.outage;
  if (marker) events.push({ tick: marker.startTick, type: 'outage_start' }, { tick: marker.endTick, type: 'outage_end' });

  for (let s = 0; s < shifts; s++) {
    let wip = 0;
    for (let t = 0; t < TICKS_PER_SHIFT; t++) {
      const tick = s * TICKS_PER_SHIFT + t;
      // The outage is a halt of the source: during the window the source is skipped, its counter does not advance and
      // no part is released. Window = ticks t with startTick <= t < endTick, counting from 0; in the engine's own
      // numbering (engine.tick after it is incremented, first tick = 1) these are the ticks startTick < n <= endTick.
      // A natural engine implementation is an early `return` at the top of _tickSource() inside that window.
      const down = outage && tick >= outage.startTick && tick < outage.endTick;
      if (outage) engine.source.interval = down ? NEVER : sourceInterval;
      const counter = engine.source.ticksSinceLast;
      engine._tick();                                          // the engine's wall-clock scheduling is not used
      if (down) engine.source.ticksSinceLast = counter;        // frozen counter, as with an early return
      wip += engine.buffers.reduce((a, b) => a + b.parts.length, 0) + engine.machines.filter((m) => m.currentPart).length;
    }
    const made = engine.sink.partsReceived - lastGood, scrap = engine.scrapSink.partsReceived - lastScrap;
    lastGood = engine.sink.partsReceived; lastScrap = engine.scrapSink.partsReceived;
    stock += made;
    const orders = demand[s];
    ordered += orders;
    const need = orders + backlog, ship = Math.min(stock, need);
    stock -= ship;
    const shippedOnTime = Math.max(0, Math.min(orders, ship - backlog));   // oldest first: backlog is served before new orders
    onTime += shippedOnTime;
    backlog = need - ship;
    perShift.push({ shift: s + 1, produced: made, scrap, orders, shipped: ship, shippedOnTime, backlog, stock, wip: +(wip / TICKS_PER_SHIFT).toFixed(2) });
    if (shippedOnTime < orders) events.push({ tick: (s + 1) * TICKS_PER_SHIFT, shift: s + 1, type: 'shortfall', ordered: orders, shippedOnTime, short: orders - shippedOnTime });
  }

  // Event log from the per-tick history: long STARVED / BLOCKED episodes per machine.
  const hist = engine.getHistory();
  for (const m of engine.machines) {
    let cur = null, start = 0;
    const flush = (end) => {
      if (cur && end - start >= MIN_EPISODE) events.push({ tick: start, shift: Math.floor(start / TICKS_PER_SHIFT) + 1, type: `machine_${cur.toLowerCase()}`, machine: m.id, ticks: end - start });
    };
    for (const row of hist) {
      const st = row[`${m.id}_state`], keep = st === 'STARVED' || st === 'BLOCKED' ? st : null;
      if (keep !== cur) { flush(row.tick); cur = keep; start = row.tick; }
    }
    flush(hist.length ? hist[hist.length - 1].tick + 1 : 0);
  }
  events.sort((a, b) => a.tick - b.tick);

  const total = shifts * TICKS_PER_SHIFT;
  const machines = {};
  for (const m of engine.machines) {
    const busy = m.ticksProcessing, flowLoss = m.ticksBlocked + m.ticksStarved;
    const quality = m.partsProcessed ? 1 - (m.id === 'M2' ? engine.scrapSink.partsReceived : 0) / m.partsProcessed : 1;
    machines[m.id] = {
      utilisation: +(busy / total).toFixed(3),
      blocked: +(m.ticksBlocked / total).toFixed(3),
      starved: +(m.ticksStarved / total).toFixed(3),
      // OEE = availability x performance x quality (see the Track B README); availability is 1 without breakdowns
      oee: { availability: 1, performance: +(busy / (busy + flowLoss || 1)).toFixed(3), quality: +quality.toFixed(3) },
    };
    machines[m.id].oee.value = +(machines[m.id].oee.availability * machines[m.id].oee.performance * machines[m.id].oee.quality).toFixed(3);
  }
  const kpis = {
    shifts,
    goodParts: engine.sink.partsReceived,
    lineYield: +(engine.sink.partsReceived / Math.max(1, engine.source.totalGenerated)).toFixed(3),
    goodPerShift: +(engine.sink.partsReceived / shifts).toFixed(2),
    scrap: engine.scrapSink.partsReceived,
    released: engine.source.totalGenerated,
    ordered,
    serviceLevel: +(onTime / ordered).toFixed(3),
    backlogEnd: backlog,
    avgWip: +(perShift.reduce((a, r) => a + r.wip, 0) / shifts).toFixed(2),
    finishedGoodsEnd: stock,
    machines,
  };
  return { perShift, kpis, events };
}

export function readDemand(csvPath) {
  return fs.readFileSync(csvPath, 'utf8').trim().split('\n').slice(1).map((l) => Number(l.split(',')[3]));
}
