# Machine simulation: starter for the production line case

A browser-based simulation of a production line: **Source → M1 (machining) → M2 (quality check) → M3 (assembly) → M4 (packaging) → Sink**. It is a discrete-event simulation in Node.js: **1 tick = 1 minute**, 1 shift = 480 ticks. The UI shows the line live (SVG over Server-Sent Events).

## Quick start

With Docker (Docker Desktop or Docker Engine with Compose):

```bash
docker compose up --build        # then open http://localhost:3000
```

The image copies `src/` when it is built, so run **`docker compose up --build` again after every code change**.

Without Docker (Node.js 20 or newer):

```bash
npm install
npm start                        # http://localhost:3000
npm run dev                      # same, restarts on file changes
npm test                         # unit tests
```

Environment variable: `PORT` (default `3000`).

## What you can do in the UI

Play, pause and reset the run, change the speed (up to 10x), tune cycle times, buffer capacities, source interval, material stock (the right end of its slider is ∞) and the reject rate of M2, spawn extra machines, load a scenario preset, and **export the simulation log** (the per-tick history) as CSV or JSON.

## The simulation log (export)

```
GET /api/export?format=csv      # or format=json
```

One row per tick since the last reset (the buffer keeps the last 100,000 ticks). Columns include `tick`, `sourceTotalGenerated`, `sourceMaterialStock`, for every machine `<id>_state` (IDLE, PROCESSING, BLOCKED, STARVED), `<id>_partsProcessed`, `<id>_ticksProcessing`, `<id>_ticksBlocked`, `<id>_ticksStarved`, for every buffer `<id>_load` and `<id>_capacity`, and `sinkPartsReceived` (good parts) and `scrapPartsReceived`. Other endpoints: `GET /api/state` (current state), `GET /api/metrics` (utilisation, throughput, lead time, bottleneck), `GET /api/presets`, `POST /api/control`.

## Running without the UI: `runHeadless`

`src/headless/run.js` runs the engine tick by tick without timers, applies the order rules of the data package README (due at the end of the shift, oldest first, backlog, finished-goods stock) and returns per-shift rows, KPIs and an event log. Usage:

```js
import { runHeadless, readDemand } from './src/headless/run.js';
import { DEFAULT_CONFIG } from './src/simulation/config.js';

const demand = readDemand('demand_profile.csv');        // orders per shift, from the data package
const result = await runHeadless({
  config: DEFAULT_CONFIG,      // simulation config, default: DEFAULT_CONFIG (material is always infinite)
  seed: 1,                     // stored as config.seed; has an effect once you implement seeding
  shifts: 20,
  demand,                      // at least `shifts` entries
  outage: { startTick: 4800, endTick: 5760 },   // optional: the helper's own source halt
  initialFinishedGoods: 0,
});
// result = { perShift: [...], kpis: {...}, events: [...] }
```

Test it: run `node src/headless/run.check.mjs` from the repository root. It reads `demand_profile.csv` in the repository root (shipped with the repository); a path argument is optional. It must print `ALL PASSED`.

The event log uses the helper's 0-based tick numbering for the outage events (`startTick` inclusive, `endTick` exclusive) and the engine's 1-based ticks for the machine episodes.

The outage setting for your own engine implementation means: on the engine ticks `startTick < n <= endTick` (n = `engine.tick` after it is incremented, the first tick is 1) the source is skipped: its counter does not advance and no part is released.

## Good to know

- The reject gate of M2 uses `Math.random()` once (`src/simulation/engine.js`, in the machine step). Runs are therefore random until you seed it.
- Material stock: `materialStock: -1` is infinite, `0` is depleted. The default configuration has 200, so the line stops after about 5 shifts: use `-1` for longer runs.
- The history buffer keeps at most 100,000 ticks (about 208 shifts).
- Each browser session (cookie `sid`) has its own engine.
- `POST /api/control` ignores unknown actions and parameters (for example `seed` or `outage`) but still answers `ok`.
- `npm audit` reports advisories in fastify 4 and @fastify/static 7. The simulation runs only locally; upgrading is optional.

## Source files

| File | Role |
|---|---|
| `src/server.js` | HTTP server, SSE stream, routes, one engine per browser session |
| `src/simulation/engine.js` | Tick loop, machine states, blocking and starvation, history |
| `src/simulation/entities.js` | Part, Machine, Buffer, Source, Sink |
| `src/simulation/config.js` | Default parameters (cycle times, capacities, reject rate, source interval) |
| `src/simulation/presets.js` | Scenario presets for the UI |
| `src/metrics/collector.js` | Pure function: state snapshot → metrics |
| `src/controls.js` | Play, pause, reset, speed (validated) |
| `src/public/` | The browser UI (plain HTML, CSS and JavaScript, no build step) |
| `src/headless/` | `runHeadless` and its test |
| `test/`, `src/__tests__/` | Unit tests (`npm test`) |

Machines advance from the end of the line backwards in each tick, so a part never passes several stations in one tick.
