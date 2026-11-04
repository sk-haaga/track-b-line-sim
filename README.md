# Machine simulation: production line case (Track B)

Extended from the organisers' `machine_sim` starter. What we changed is listed under **Changes by our team** below; the original starter documentation follows after it. All assumptions are in [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) and are referred to by their IDs (for example `SIM-02`).

## Changes by our team

### 1. Seeded randomness (`SIM-01`, `SIM-02`)

**What:** the reject gate of M2 no longer uses `Math.random()`. All randomness comes from `src/simulation/random.js`: a seeded generator (mulberry32) with one named stream per random process (for example `reject:M2`). The seed is `config.seed` (default `1`; seed `0` is valid and not treated as "no seed"). `reset()` replays a run exactly. `runHeadless({ seed })` now has an effect.

**Why:** without a seed every run differs, so comparing a countermeasure with the baseline mixes the effect of the change with random noise. The brief's own example: unseeded, comparing the line with itself passes the 2-point rule in about 1 of 6 tries. Separate streams mean that adding a new random process later (machine breakdowns) does not change the reject sequence, so two configurations run with the same seed are compared fairly.

**How validated:** `test/seeding.test.js` (same seed → identical run; seeds 0, 1, 2 differ; reset replays; streams are independent; `Math.random` is never called). The spread over seeds 1–30 matches the spread the data README reports for the unseeded starter (see `results/reference-check.md`).

### 2. Supplier outage in the engine (`SUP-01`)

**What:** `config.source.outage = { startTick, endTick }` (or `null`). On the engine ticks `startTick < n <= endTick` the source is skipped: its counter does not advance, no part is released and no material is booked. The state reports `source.outage` and `source.inOutage`. The outage can be set at run time through `POST /api/control` with `params: { outage: { startTick, endTick } }` or cleared with `outage: null`; invalid values answer `400`.

**Why:** in the starter the outage existed only inside the headless helper, so neither the engine nor the UI could show the plant's main disruption.

**How validated:** `test/outage.test.js` runs the reference outage through the engine and through the helper's own `outage` option, for flat demand and the demand profile, seeds 1 and 2: per-shift rows, KPIs and the event log are **identical**. Further tests check the exact tick window, the frozen counter, set and clear at run time, and input validation.

### 3. Reference check (`SIM-05`)

**What:** `npm run reference` runs the four reference scenarios (`src/scenarios/reference.js`) with seeds 1 and 2, compares the average service level with the reference values (±2 points, ±5 with the outage), adds the mean and spread over seeds 1–30, and writes `results/reference-check.md`.

**Result:** all four scenarios pass (baseline 99.8%, supplier outage 75.0%, demand swing 56.3%, both 47.2% against 100 / 76 / 57 / 48).

**Also changed:** `src/headless/run.check.mjs` now gives each of its 20 runs its own seed (1–20). Otherwise all runs would use the same default seed and be identical.

### 4. Cost model inside the tool (`COST-*`)

**What:** `src/economics/rateCard.js` reads `data/rate_card.csv`; `src/economics/cost.js` turns any `runHeadless` result into revenue, machine, material, WIP and finished-goods holding, amortised one-time costs, lost sales, stock values, **cost per good unit** and **total profit**, following the cost rules of the data README. Cost per good unit is reported twice: without finished-goods holding (the organiser's baseline check) and with it (to compare stock options like with like, `COST-10`).

**Why:** the brief asks for cost and service level next to parts; nothing in the starter computed costs.

**How validated:** `test/cost.test.js`. The default line costs **EUR 102.9 per good unit** (seeds 1 and 2: 102.6 and 103.2) against the organiser's EUR 102.8. Each formula is checked on a hand-made example, and total profit equals the sum of its parts.

### 5. Countermeasures, pricing and verification

**What:**
- `src/scenarios/levers.js`: one format for countermeasures (starting stock, cycle time, reject rate, buffer capacity, source interval, extra machines), with the limits `LEV-01` to `LEV-08`. The advisor will use the same format.
- `src/economics/pricing.js`: the one-time cost of a countermeasure is derived from its lever changes and the rate card (for example M3 13 → 12 min = EUR 30,000). The advisor never prices; this code does.
- `src/scenarios/verify.js`: the official check of the brief (`SIM-03`: +2 points service level, average of seeds 1 and 2; good parts and scrap rate not worse by more than 10%; 2–3 points = weak evidence) and our stricter check (`SIM-04`: also seeds 1–10 and profit must not fall).
- `src/scenarios/run.js`: `runScenario()` runs a scenario with a countermeasure over several seeds and adds the costs.

**How validated:** `test/levers.test.js` and `test/verify.test.js` (limits, prices, rule edges such as exactly 2.0 vs 1.9 points, and "the line compared with itself never passes").

### 6. Scenario runner and results tables

**What:** `npm run scenarios` reads `config/countermeasures.json` (a catalogue of options and the recommended option per scenario) and `config/business.json`, runs the four reference scenarios without and with every option (seeds 1–10, about 20 seconds, no LLM) and writes:
- `results/scenario-results.md` / `.csv`: every scenario twice, without and with its recommended countermeasure: throughput, service level, WIP, scrap, cost per good unit and total profit (the table the brief asks for);
- `results/countermeasure-comparison.md` / `.csv`: every option in every scenario: effect, one-time cost, profit change, payback, official and strict check, the best option by rule `BIZ-04`, and an annual view (`BIZ-01`);
- `results/scenarios.json`: all numbers, for the business spreadsheet and the advisor.

The recommended options in `config/countermeasures.json` are **provisional** (best by rule `BIZ-04`) until the business team confirms them.

### How to run everything

```bash
npm install
npm test                 # all unit tests (98)
npm run check            # organiser acceptance check of runHeadless, must print ALL PASSED
npm run reference        # four reference scenarios, writes results/reference-check.md
npm run scenarios        # results tables with costs and countermeasures, writes results/
npm start                # UI at http://localhost:3000
```

### Not done yet

UI controls for seed, outage and costs; machine breakdowns; supplier-side countermeasures; warm-start scenarios; the AI shift advisor.

---

# Original starter documentation


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

- ~~The reject gate of M2 uses `Math.random()`~~ Changed by our team: the reject gate uses a seeded stream (`config.seed`), see above.
- Material stock: `materialStock: -1` is infinite, `0` is depleted. The default configuration has 200, so the line stops after about 5 shifts: use `-1` for longer runs.
- The history buffer keeps at most 100,000 ticks (about 208 shifts).
- Each browser session (cookie `sid`) has its own engine.
- `POST /api/control` ignores unknown actions and parameters but still answers `ok`. Changed by our team: it now accepts `seed` (applies at the next reset) and `outage` (`{ startTick, endTick }` or `null`), and answers `400` for an invalid outage.
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
