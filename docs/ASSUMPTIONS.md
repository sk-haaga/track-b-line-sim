# Assumptions and own decisions

Track B – Smart Tech Components production line simulation and AI shift advisor.
Last updated: 2026-11-04.

This file is the single table of all assumptions, as the General Brief requires: every assumption is marked as one, with its source or reasoning. It also lists the decisions we made ourselves (own data, own rules, own metrics), so that the jury and any reader can see where our numbers come from.

## How to read this file

**Source**
- **Organiser:** taken from the Track B README, `rate_card.csv` or `failure_rates.csv`. The rate card values are fictional organiser values, and some are marked there as organiser assumptions.
- **Ours, derived:** calculated by us from organiser data. The calculation is given.
- **Ours, invented:** no data exists, so we chose a value. The reasoning is given, and where the value could change a decision, we test a range (see *Sensitivity plan*).

**Status**
- **Given:** comes from the organisers; we use it unchanged.
- **Ours:** our decision; final unless we change it here.
- **To confirm:** we asked or will ask the organisers; replace with their answer.
- **To measure:** a planning value; replace with the value measured in our runs or logs.

**Used in**
- `SIM` simulation engine
- `COST` cost model
- `ADV` AI shift advisor
- `EVAL` evaluation
- `BIZ` business case and decision memo

**Rules for changing this file**
- Keep IDs stable. Add new assumptions with the next free number in their section, and never reuse an ID.
- Refer to IDs in code comments and in the spreadsheet (for example `// COST-03`), so every number can be traced.
- Record every change in the *Change log* at the end.

---

## Organiser values we use

### Rate card (`rate_card.csv`)

| Item | Value | Note |
|---|---|---|
| Machine hour rate M1 / M2 / M3 / M4 | EUR 85 / 55 / 90 / 40 per hour | Charged for every scheduled hour, working or waiting |
| Material | EUR 38 per part | Booked when a part is released into the line |
| Selling price | EUR 180 per stand | |
| Holding, work in progress | EUR 0.30 per part per hour | Parts in buffers or machines |
| Holding, finished stock | EUR 0.50 per stand per hour | |
| Lost-sales penalty | EUR 90 per stand | Charged once per ordered stand not shipped by its due time |
| Scrap value | EUR 46.42 per part | Information only: already inside material and machine cost, never added again |
| Expediting premium | +40% of material cost | Emergency delivery during an outage |
| Second supplier premium | +8% of material cost | |
| Second supplier qualification | EUR 2,000 one-time | |
| Extra buffer slot | EUR 150 one-time per slot | |
| Parallel machine | EUR 95,000 one-time | Or EUR 49.48 depreciation per shift (same cost, use one of the two) |
| Cycle time reduction | EUR 30,000 one-time per minute, per machine | Organiser assumption |
| Reject rate reduction | EUR 8,000 one-time per percentage point | Organiser assumption |

### Failure modes (`failure_rates.csv`, AI4I 2020 data set)

| Mode | Station | Chance per part | Repair time |
|---|---|---|---|
| TWF – tool wear | M1 | 0.46% | 20 min (organiser assumption) |
| HDF – heat dissipation | M1 | 1.15% | 45 min (organiser assumption) |
| PWF – power | M3 | 0.95% | 30 min (organiser assumption) |
| OSF – overstrain | M3 | 0.98% | 60 min (organiser assumption) |
| RNF – random | any | 0.19% | 15 min (organiser assumption) |

### Derived constants

| Constant | Value | How it is derived |
|---|---|---|
| Line capacity, default line | ~36.8 good stands per shift | Organiser README |
| Average demand of the profile | 31.2 orders per shift (85% of capacity) | Organiser README |
| Machine cost per shift, M1–M4 | EUR 2,160 | (85 + 55 + 90 + 40) × 8 h |
| Holding per part in the line per shift | EUR 2.40 | 0.30 × 8 h |
| Holding per finished stand per shift | EUR 4.00 | 0.50 × 8 h |
| Share of a one-time cost in a 20-shift run | 1.04% | 20 ÷ 1,920 shifts (8 years × 240 shifts) |
| Extra M3 machine per shift | EUR 769.48 | 720 (machine rate × 8 h) + 49.48 depreciation |
| Value of a finished stand in stock | EUR 103 | Organiser: baseline cost per good unit 102.8, rounded |
| Baseline cost per good unit (check value) | EUR 102.8 | Organiser; our cost code must reproduce it |
| Contribution per stand | ~EUR 77 | 180 − 102.8 |
| Expected M3 availability with breakdowns | ~93% | Chance per part 2.12% (PWF + OSF + RNF), so a failure every ~613 min of work (13 ÷ 0.0212); average repair ~42.5 min; 613 ÷ (613 + 42.5) |
| Raw parts needed to bridge the reference outage | ~87 parts (~EUR 3.3k) | 960 min ÷ one part every 11 min, × EUR 38 |

---

## 1. Time and plant calendar

| ID | Assumption | Value | Source and reasoning | Used in | Status |
|---|---|---|---|---|---|
| TIME-01 | 1 tick = 1 minute; 1 shift = 480 ticks (8 hours) | – | Organiser | SIM, COST | Given |
| TIME-02 | The plant runs one shift per working day | 240 shifts per year | Organiser: the rate card spreads investments over 8 years at 240 shifts per year | COST, BIZ | Given |
| TIME-03 | No breaks and no planned downtime inside a shift | 480 working minutes per shift | Ours, invented: simplification, not modelled; named as a limit | SIM | Ours |
| TIME-04 | Our own "warm start" scenarios first run 6 shifts that are not counted | 6 warm-up shifts | Ours, derived: in our runs output reaches full speed from shift 2, but the number of parts in the line only settles (~16) after shift 6. The four reference scenarios keep the cold start. Not implemented yet: the 60-shift quarter (SCN-02) dilutes the cold start instead | SIM, EVAL | To confirm |

## 2. Demand and orders

| ID | Assumption | Value | Source and reasoning | Used in | Status |
|---|---|---|---|---|---|
| DEM-01 | The demand profile represents the client's real order pattern | First 20 shifts for the reference scenarios | Organiser: real order data (SupplyGraph), rescaled to 85% of capacity | SIM, BIZ | Given |
| DEM-02 | Shifts 21–60 of the profile are kept as unseen test data for the advisor | – | Ours: we must not tune the advisor on the same data we test it on | ADV, EVAL | Ours |
| DEM-03 | Orders of a shift are known only at the start of that shift; there is no forecast | – | Organiser order rules. The advisor may not use future orders | SIM, ADV | Given |
| DEM-04 | Late orders are delivered later, never cancelled; the oldest orders are served first | – | Organiser order rules | SIM, COST | Given |
| DEM-05 | No demand growth or seasonality over the horizon | – | Ours, invented: no data | BIZ | Ours |

## 3. Supplier and outage

| ID | Assumption | Value | Source and reasoning | Used in | Status |
|---|---|---|---|---|---|
| SUP-01 | Reference outage: supply stops completely; no part is released and no material is booked | 960 min from minute 4,800 (shifts 11–12) | Organiser | SIM | Given |
| SUP-02 | **Number of supplier outages per year**, for the annual business case | **4 per year, each 2 shifts long** | Ours, invented: the client calls outages a recurring pain but gives no frequency | BIZ | To confirm |
| SUP-03 | Normal resupply lead time (only if raw-material stock is modelled) | 1 shift | Ours, invented | SIM | Ours |
| SUP-04 | The second supplier is not affected by the main supplier's outage | – | Ours: this is the purpose of a second supplier | SIM | Ours |
| SUP-05 | Second supplier lead time and capacity | 2 shifts; can cover the full need | Ours, invented | SIM | Ours |
| SUP-06 | Second supplier price premium and set-up cost | +8% material; EUR 2,000 one-time | Organiser (rate card) | COST | Given |
| SUP-07 | Emergency delivery (expediting) | Arrives within 4 hours; +40% material price | Lead time ours, invented; premium from the rate card | SIM, COST | Ours |
| SUP-08 | Holding cost for raw parts (only if raw-material stock is modelled) | EUR 0.18 per part per hour | Ours, derived: finished-stock rate scaled by value, 0.50 × (38 ÷ 103). The rate card has no such rate | COST | Ours |

## 4. Machines and breakdowns

| ID | Assumption | Value | Source and reasoning | Used in | Status |
|---|---|---|---|---|---|
| MAC-01 | The failure chance applies to each part a machine finishes | Values from `failure_rates.csv` | Ours, derived: the CSV's example time between failures at M3 (for example 1,368 min for PWF = 13 min ÷ 0.0095) matches this reading | SIM | Ours |
| MAC-02 | Which machine each failure mode hits | TWF, HDF → M1; PWF, OSF → M3; RNF → all four stations | Organiser CSV (`suggested_station`); "any station" read by us as every station | SIM | Ours |
| MAC-03 | Repair takes a fixed time per failure mode | 15–60 min, as in the CSV | Organiser assumption | SIM | Given |
| MAC-04 | A part inside a machine when it fails is finished after the repair, not scrapped | – | Ours, invented: simplest realistic choice | SIM | Ours |
| MAC-05 | Repair cost is included in the machine hour rate | No extra cost | Ours: the rate card has no repair cost | COST | Ours |
| MAC-06 | Machine cost keeps running during a repair | – | Organiser rule: machine cost accrues for every scheduled hour | COST | Given |
| MAC-07 | Breakdowns are switched off in the four reference scenarios and on in our own breakdown scenarios | – | Ours: keeps the reference results comparable between teams | SIM, EVAL | Ours |
| MAC-08 | An extra parallel machine is identical to the original (cycle time, reject rate, failure chances) | – | Organiser code: a spawned machine copies the original | SIM | Given |

| MAC-09 | One random draw per finished part; the failure modes of a station share it, so at most one mode fires per part | – | Ours: simple, reproducible, and the probabilities in the CSV are small | SIM | Ours |
| MAC-10 | A repair-time factor scales all repair times at once | Default 1 (sensitivity 0.5–1.5) | Ours: implements the MAC-03 sensitivity test | SIM | Ours |

Validation target for MAC-01 to MAC-03: with breakdowns on, M3 should be available about 93% of the time (see *Derived constants*). Measured: 93.0% over 200 shifts (seed 1); test `test/breakdowns.test.js` checks 91.5–95% over seeds 1–3. With breakdowns the line makes about 34.3 instead of 36.8 good stands per shift.

## 5. Costs and accounting

| ID | Assumption | Value | Source and reasoning | Used in | Status |
|---|---|---|---|---|---|
| COST-01 | All rate card values are used as given | See *Rate card* | Organiser (fictional values) | COST | Given |
| COST-02 | Labour is included in the machine hour rates | – | Ours: the rate card has no separate labour cost | COST | Ours |
| COST-03 | **Lost-sales penalty** | **EUR 90 per late stand, charged once** | Organiser | COST, BIZ | Given |
| COST-04 | Finished stock is valued at EUR 103 per stand at the start and at the end of a run | – | Organiser rule. We also test valuing end stock at its real extra cost (~EUR 45), because EUR 103 makes overproduction look profitable | COST, BIZ | Given |
| COST-05 | In our realistic stock scenario, the starting stock must first be built from spare capacity; it is not given for free | Build-up shifts are simulated and costed | Ours: in reality stock does not appear by itself. The reference scenarios keep the organiser rule | SIM, COST, BIZ | To confirm |
| COST-06 | Scrap has no resale value | EUR 0 | Organiser (rate card: value lost) | COST | Given |
| COST-07 | Payback is simple payback: one-time cost ÷ profit gain per shift, without interest or inflation | – | Ours: keeps the comparison simple and transparent | BIZ | Ours |
| COST-08 | The selling price stays the same; no volume discounts | EUR 180 | Organiser | COST | Given |
| COST-09 | Parts still inside the line at the end of a run get no value | – | Organiser rules (only finished stock is credited) | COST | Given |
| COST-10 | Profit includes holding cost for finished stock. Cost per good unit is reported twice: without finished-stock holding (the organiser check, EUR 102.8) and with it | – | Ours: compare like with like, as the README asks; with holding, the baseline cost per unit is a few euros higher | COST, BIZ | Ours |
| COST-11 | An extra machine's EUR 95,000 investment is amortised like every one-time cost (= the EUR 49.48 per shift depreciation, never both), and its station's hour rate is charged for every scheduled hour | EUR 769.48 per shift for an extra M3 | Organiser | COST | Given |
| COST-12 | Making a machine slower, raising the reject rate or removing buffer slots earns no refund | EUR 0 | Ours: investments are not reversible | COST | Ours |
| COST-13 | In the sensitivity columns, finished stock left at the end of a run is valued at EUR 45 instead of EUR 103 | EUR 45 | Ours, derived: one extra stand costs about 38 ÷ 0.9 (line yield) ≈ EUR 42 of material plus holding. Removes the profit a push line books by overproducing (see COST-04) | COST, BIZ | Ours |

## 6. Limits on the levers (advisor and countermeasure comparison)

| ID | Assumption | Value | Source and reasoning | Used in | Status |
|---|---|---|---|---|---|
| LEV-01 | Starting finished stock | At most 60 stands | Organiser | ADV, BIZ | Given |
| LEV-02 | A machine's cycle time can be reduced by at most 3 minutes, and never below 1 minute | M3: 13 → at least 10 min | Ours, invented: physical limit of each process step | ADV, BIZ | Ours |
| LEV-03 | M2 reject rate cannot go below 2% | – | Ours, invented: no process reaches zero defects | ADV, BIZ | Ours |
| LEV-04 | Each buffer holds at most 20 parts | – | Ours, invented: floor space | ADV, BIZ | Ours |
| LEV-05 | The supplier delivers at most one part every 8 minutes | Source interval at least 8 min | Ours, invented: supplier capacity | ADV, BIZ | Ours |
| LEV-06 | At most 1 extra machine per station | – | Ours, invented: budget and space (the simulation allows up to 3) | ADV, BIZ | Ours |
| LEV-07 | Not modelled: overtime, extra shifts, product variants, changeovers | – | Ours: out of scope; named as limits | SIM, BIZ | Ours |
| LEV-08 | An extra parallel machine copies its station's original machine after the other levers are applied, and is priced as one new machine (no extra cycle-time charge) | – | Ours: a new machine is bought at the current specification | SIM, COST | Ours |

## 7. Simulation method and verification

| ID | Assumption | Value | Source and reasoning | Used in | Status |
|---|---|---|---|---|---|
| SIM-01 | Seeds 1 and 2 for the official check; seeds 1–10 for robustness | – | Organiser (seeds 1 and 2) + ours (seeds 1–10) | SIM, EVAL | Ours |
| SIM-02 | Each random process has its own random stream (reject gate, each machine's failures) | – | Ours: changing one part of the model does not reshuffle the others, so comparisons between options are fair | SIM | Ours |
| SIM-03 | Official acceptance rule for a proposal: service level rises by at least 2 points (average of seeds 1 and 2), and neither good parts per shift nor scrap rate gets worse by more than 10% | – | Organiser | ADV, EVAL | Given |
| SIM-04 | Our additional, stricter check: the official rule passes, total profit does not fall, and the average over seeds 1–10 still gains at least 2 points | – | Ours: 2 seeds are thin evidence and the official rule ignores cost | ADV, EVAL | Ours |
| SIM-05 | The reference scenarios count as reproduced if the average of seeds 1 and 2 lies within about ±2 points of the reference service level (±5 points in the scenarios with the outage) | Baseline ~100%, outage ~76%, swing ~57%, both ~48% | Organiser | SIM, EVAL | Given |
| SIM-06 | Differences below 0.1 good parts per shift are noise | – | Organiser | EVAL | Given |
| SIM-07 | "Worse by more than 10%" in the official rule is a relative change | Scrap rate 10.0% may rise to at most 11.0%; good parts 36.8 may fall to at most 33.1 per shift | Ours: reading of the brief | ADV, EVAL | Ours |

## 8. AI shift advisor

| ID | Assumption | Value | Source and reasoning | Used in | Status |
|---|---|---|---|---|---|
| ADV-01 | The advisor only recommends; the plant manager decides. No change is applied automatically | – | Ours: trust and safety | ADV | Ours |
| ADV-02 | The advisor sees summarised facts (per machine and shift), not the raw event log, and never sees future orders | – | Ours: the raw log is too noisy (~1,000 events per run); see also DEM-03 | ADV | Ours |
| ADV-03 | The advisor runs once per shift at shift handover, with up to 2 revision rounds | At most 3 AI calls per shift | Ours, invented: usage pattern | ADV, BIZ | Ours |
| ADV-04 | Tokens per AI call | Planning value ~3,000 in and ~1,000 out; replaced by the measured average from our log | Ours | BIZ | To measure |
| ADV-05 | Price per token | Public list price of the chosen model at the time of the pitch | Ours: the organisers' endpoint gives no price | BIZ | Ours |
| ADV-06 | A cheap model for development, a more capable model for final runs | Model name is a config value | Organiser tip; which models the endpoint offers is to be confirmed | ADV | To confirm |
| ADV-07 | Low temperature and fixed, versioned prompts; every proposal is still verified by the simulation | Temperature 0.2 | Ours: reduces variation, but the AI output is never trusted without a re-run | ADV, EVAL | Ours |
| ADV-08 | Acceptable advisor response time, including the simulation re-runs | Under 60 s | Ours, invented: the plant manager reads it at shift handover | ADV, EVAL | Ours |
| ADV-09 | IT upkeep of the advisor | 4 h per month × EUR 80 per hour | Ours, invented (low confidence) | BIZ | Ours |
| ADV-10 | Plant manager's time saved by the advisor | 20 min per shift × EUR 70 per hour | Ours, invented (low confidence) | BIZ | Ours |
| ADV-11 | The advisor's AI cost appears only in the business documents, not in the scenario profits | – | Organiser rule | BIZ | Given |

## 9. Business case and annualising

| ID | Assumption | Value | Source and reasoning | Used in | Status |
|---|---|---|---|---|---|
| BIZ-01 | A year is 12 periods of 20 shifts. A period with an outage behaves like scenario "both", all others like "demand swing" | 4 "both" + 8 "swing" periods | Ours, derived from TIME-02 and SUP-02 | BIZ | Ours |
| BIZ-02 | Results of 20-shift periods can be added up; stock carried from one period to the next is ignored | – | Ours: simplification; checked with one 60-shift run. Because every period starts from an empty line and stock options get their starting stock in every period, the annual view is an upper bound | BIZ | Ours |
| BIZ-03 | Investments are spread over 8 years | 1,920 shifts | Organiser | COST, BIZ | Given |
| BIZ-04 | Decision rule: recommend the option with the highest profit among the options that pass the strict check (SIM-04), and report its service level. If the client sets a service-level target, recommend the cheapest option that meets it | – | Ours: the brief gives no target. `npm run scenarios` shows the best option by this rule; the chosen option per scenario is stored in `config/countermeasures.json` | BIZ | To confirm |
| BIZ-05 | A more realistic annual view: 4 × the 60-shift quarter (SCN-02), with breakdowns and one outage per quarter; starting stock given once per quarter. Shown with end stock at EUR 103 and at EUR 45 (COST-13). BIZ-01 stays as an upper bound | 4 quarters per year | Ours, derived from TIME-02 and SUP-02 | BIZ | Ours |

## 10. Own scenarios

| ID | Assumption | Value | Source and reasoning | Used in | Status |
|---|---|---|---|---|---|
| SCN-01 | Each reference scenario is also run with machine breakdowns (`<id>-bd`); the four reference scenarios themselves stay unchanged | 20 shifts | Ours: brief asks for extra scenarios for own features | SIM, EVAL, BIZ | Ours |
| SCN-02 | "quarter-60": the full 60-shift demand profile = one quarter (240 shifts per year), the reference outage in shift 11, breakdowns on | 60 shifts | Ours, derived from TIME-02 and SUP-02 (4 outages per year = 1 per quarter) | SIM, BIZ | Ours |
| SCN-03 | The outage in quarter-60 falls in shift 11, the same position as in the reference scenarios | Ticks 4,800–5,760 | Ours, invented: keeps it comparable; outage timing is not known | SIM | Ours |

---

## Sensitivity plan

We test each value below one at a time (low / base / high) and show whether the recommendation changes. The first five are decision-critical; the business case shows them in one "does the answer flip?" chart.

| ID | Assumption | Low | Base | High | What to watch |
|---|---|---|---|---|---|
| **COST-03** | Lost-sales penalty | EUR 45 | EUR 90 | EUR 135 | Does finished stock still win? |
| **SUP-02** | Outages per year | 0 | 4 | 12 | Payback of the faster M3; value of stock |
| **COST-05** | Starting stock | Free at start | Built from spare capacity | – | Service level in the first shifts; extra cost |
| **COST-04** | Value of end stock | EUR 45 | EUR 103 | – | Options that overproduce |
| **MAC-03** | Repair times | −50% | CSV values | +50% | Real capacity; value of buffers |
| DEM-05 | Demand level | −10% | Profile | +10% | Service level and backlog |
| SUP-03 | Normal resupply lead time | 0.5 shift | 1 shift | 2 shifts | Size of raw-material stock needed |
| SUP-05 | Second supplier capacity | 50% | 100% | – | Service level during the outage |
| SUP-07 | Expediting lead time | 2 h | 4 h | 8 h | Parts lost during the outage |
| SUP-08 | Raw-part holding cost | EUR 0.10 | EUR 0.18 | EUR 0.30 | Raw stock vs finished stock |
| MAC-05 | Repair cost | EUR 0 | EUR 0 | EUR 100 per repair | Cost per good unit |
| ADV-03 | Advisor runs per shift | 1 | 3 calls | 10 | AI cost per year |
| ADV-09 | IT upkeep | 2 h/month | 4 h/month | 10 h/month | Advisor running cost |
| ADV-10 | Time saved | 0 min | 20 min | 40 min | Advisor value |

## Open points to confirm with the organisers

| Question | Affects |
|---|---|
| Does the client have a target service level, or should we maximise profit? | BIZ-04 |
| Is starting stock free at the start of a scenario, or must it be built? | COST-05 |
| May we add warm-start scenarios next to the unchanged reference scenarios? | TIME-04 |
| How often does a supplier outage happen per year? | SUP-02 |
| Which models does the API endpoint offer, and is there a rate limit? | ADV-06 |

## Change log

| Date | Change | By |
|---|---|---|
| 2026-11-04 | First version | |
| 2026-11-04 | LEV-02 generalised to every machine; added LEV-08, COST-11, COST-12, SIM-07; BIZ-02 and BIZ-04 made precise (scenario runner) | |
| 2026-11-04 | Breakdowns implemented: MAC-09, MAC-10, measured availability; own scenarios SCN-01 to SCN-03; COST-13, BIZ-05; TIME-04 note | |
