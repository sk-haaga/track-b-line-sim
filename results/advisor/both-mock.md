# Shift advisor report: both

Model: mock-rules (mock), prompt v1; 1 round(s); 0 tokens; 0.0 s for the model calls.
Without changes: service level 47.2%, 33.6 good parts per shift (seeds 1–2).

## Diagnosis

Orders were late (F4). Large orders at the start hit an empty line and empty stock. Supplier outage stopped the whole line. M3 limits the output. Blocked and starved machines around M3 are consequences of that constraint.

Root causes:
- Large orders at the start hit an empty line and empty stock (F3, F4)
- Supplier outage stopped the whole line (F5)
- M3 limits the output (F10)

## Proposals and how they were verified

| Round | Proposal | Cited facts | Δ SL (points) | Good parts | Scrap rate | WIP | Official check | Strict check | One-time cost (EUR) | Δ profit (EUR) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | FG stock 40 | F4, F2 | +47.6 | +0.0% | +0.0% | +0.0% | verified | yes | 0 | 25,020 |
| 1 | M3 cycle 13→12 min | F10 | +12.7 | +3.8% | -0.9% | -73.4% | verified | yes | 30,000 | 8,655 |

**Recommended:** FG stock 40 (+47.6 points service level, verified, passes the strict check).

## Facts given to the model

- **F1** Over 20 shifts: service level 47% (291 of 626 ordered units shipped on time); 33.6 good parts per shift; scrap 87 of 774 released parts (11%); average WIP 8.12; backlog at the end 0; finished-goods stock at the end 46.
- **F2** Starting finished-goods stock 0; the line starts empty. Current lever changes: none (default line). Machine breakdowns off.
- **F3** Orders per shift ranged 2–61 (average 31.3); orders exceeded the average output of 33.6 parts in shifts 1–5, 7, 13, 17, 19; first three shifts ordered 61, 55, 36.
- **F4** Shortfalls (orders not shipped on time) in shifts 1–9, 11–15: 335 units in total; worst shift 5 (50 of 50 late). Backlog peaked at 58 units after shift 5. Late orders are served first, so a backlog also delays the following shifts.
- **F5** Supplier outage from tick 4800 to 5760 (960 min, shifts 11–12): no parts released. Good parts produced shift 11: 16, shift 12: 0, shift 13: 36.
- **F6** M1: busy 32%, blocked 19%, starved 49%; OEE 32% (availability 100%). Starved for an hour or more in shifts 11.
- **F7** M2: busy 24%, blocked 37%, starved 39%; OEE 21% (availability 100%). Starved for an hour or more in shifts 11.
- **F8** M3: busy 91%, blocked 0%, starved 9%; OEE 91% (availability 100%). Starved for an hour or more in shifts 11.
- **F9** M4: busy 14%, blocked 0%, starved 86%; OEE 14% (availability 100%). Starved for an hour or more in shifts 11.
- **F10** M3 is the busiest machine (91% busy, 0% blocked): it limits the line's output. Machines before it are often blocked and machines after it are often starved, which is a consequence of the constraint, not a separate problem.
