# Shift advisor report: baseline-bd

Model: mock-rules (mock), prompt v1; 1 round(s); 0 tokens; 0.0 s for the model calls.
Without changes: service level 94.9%, 34.4 good parts per shift (seeds 1–2).

## Diagnosis

Orders were late (F4). Large orders at the start hit an empty line and empty stock. Machine breakdowns cut capacity. M3 limits the output. Blocked and starved machines around M3 are consequences of that constraint.

Root causes:
- Large orders at the start hit an empty line and empty stock (F3, F4)
- Machine breakdowns cut capacity (F5, F6, F7, F8)
- M3 limits the output (F9)

## Proposals and how they were verified

| Round | Proposal | Cited facts | Δ SL (points) | Good parts | Scrap rate | WIP | Official check | Strict check | One-time cost (EUR) | Δ profit (EUR) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | FG stock 40 | F4, F2 | +5.1 | +0.0% | +0.0% | +0.0% | verified | yes | 0 | 43 |
| 1 | M3 cycle 13→12 min | F9 | +3.6 | +7.2% | -1.7% | -19.8% | verified | yes | 30,000 | 3,329 |

**Recommended:** FG stock 40 (+5.1 points service level, verified, passes the strict check).

## Facts given to the model

- **F1** Over 20 shifts: service level 100% (678 of 680 ordered units shipped on time); 34.8 good parts per shift; scrap 87 of 798 released parts (11%); average WIP 12.52; backlog at the end 0; finished-goods stock at the end 15.
- **F2** Starting finished-goods stock 0; the line starts empty. Current lever changes: none (default line). Machine breakdowns on.
- **F3** Orders per shift ranged 34–34 (average 34); orders never exceeded the average output; first three shifts ordered 34, 34, 34.
- **F4** Shortfalls (orders not shipped on time) in shifts 1: 2 units in total; worst shift 1 (2 of 34 late). Backlog peaked at 2 units after shift 1. Late orders are served first, so a backlog also delays the following shifts.
- **F5** M1: busy 33%, blocked 44%, starved 17%, down for repair 6%; OEE 33% (availability 94%). 17 breakdowns (HDF ×11, TWF ×6), 615 min of repair, in shifts 2–6, 8, 10, 13–16, 18.
- **F6** M2: busy 25%, blocked 62%, starved 13%, down for repair 0%; OEE 22% (availability 100%). 1 breakdowns (RNF ×1), 15 min of repair, in shifts 2.
- **F7** M3: busy 94%, blocked 0%, starved 1%, down for repair 5%; OEE 94% (availability 95%). 12 breakdowns (PWF ×5, RNF ×1, OSF ×6), 525 min of repair, in shifts 6–11, 13, 16–18, 20.
- **F8** M4: busy 14%, blocked 0%, starved 85%, down for repair 0%; OEE 14% (availability 100%). 1 breakdowns (RNF ×1), 15 min of repair, in shifts 13. Starved for an hour or more in shifts 10–11, 13, 17–18.
- **F9** M3 is the busiest machine (94% busy, 0% blocked): it limits the line's output. Machines before it are often blocked and machines after it are often starved, which is a consequence of the constraint, not a separate problem.
