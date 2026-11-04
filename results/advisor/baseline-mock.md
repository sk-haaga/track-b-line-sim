# Shift advisor report: baseline

Model: mock-rules (mock), prompt v1; 3 round(s); 0 tokens; 0.0 s for the model calls.
Without changes: service level 99.8%, 36.8 good parts per shift (seeds 1–2).

## Diagnosis

Orders were late (F4). Large orders at the start hit an empty line and empty stock. M3 limits the output. Blocked and starved machines around M3 are consequences of that constraint.

Root causes:
- Large orders at the start hit an empty line and empty stock (F3, F4)
- M3 limits the output (F9)

## Proposals and how they were verified

| Round | Proposal | Cited facts | Δ SL (points) | Good parts | Scrap rate | WIP | Official check | Strict check | One-time cost (EUR) | Δ profit (EUR) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | FG stock 40 | F4, F2 | +0.2 | +0.0% | +0.0% | +0.0% | not verified | no | 0 | -3,106 |
| 1 | M3 cycle 13→12 min | F9 | +0.2 | +5.9% | -1.8% | -75.8% | not verified | no | 30,000 | 1,743 |
| 2 | FG stock 60 | F4 | +0.2 | +0.0% | +0.0% | +0.0% | not verified | no | 0 | -4,706 |
| 2 | M3 cycle 13→12 min, FG stock 30 | F9, F4 | +0.2 | +5.9% | -1.8% | -75.8% | not verified | no | 30,000 | -657 |
| 3 | {"initialFinishedGoods":60} | F4 | – | – | – | – | rejected: already tried | – | – | – |
| 3 | {"cycleTime":{"M3":12},"initialFinishedGoods":30} | F9, F4 | – | – | – | – | rejected: already tried | – | – | – |

**Recommended:** no proposal was verified.

## Facts given to the model

- **F1** Over 20 shifts: service level 100% (678 of 680 ordered units shipped on time); 36.7 good parts per shift; scrap 90 of 840 released parts (11%); average WIP 12.35; backlog at the end 0; finished-goods stock at the end 54.
- **F2** Starting finished-goods stock 0; the line starts empty. Current lever changes: none (default line). Machine breakdowns off.
- **F3** Orders per shift ranged 34–34 (average 34); orders never exceeded the average output; first three shifts ordered 34, 34, 34.
- **F4** Shortfalls (orders not shipped on time) in shifts 1: 2 units in total; worst shift 1 (2 of 34 late). Backlog peaked at 2 units after shift 1. Late orders are served first, so a backlog also delays the following shifts.
- **F5** M1: busy 35%, blocked 46%, starved 19%; OEE 35% (availability 100%).
- **F6** M2: busy 26%, blocked 59%, starved 15%; OEE 23% (availability 100%).
- **F7** M3: busy 99%, blocked 0%, starved 1%; OEE 99% (availability 100%).
- **F8** M4: busy 15%, blocked 0%, starved 85%; OEE 15% (availability 100%).
- **F9** M3 is the busiest machine (99% busy, 0% blocked): it limits the line's output. Machines before it are often blocked and machines after it are often starved, which is a consequence of the constraint, not a separate problem.
