# Shift advisor report: both-bd

Model: mock-rules (mock), prompt v1; 1 round(s); 0 tokens; 0.0 s for the model calls.
Without changes: service level 22.9%, 31.6 good parts per shift (seeds 1–2).

## Diagnosis

Orders were late (F4). Large orders at the start hit an empty line and empty stock. Supplier outage stopped the whole line. Machine breakdowns cut capacity. M3 limits the output. Blocked and starved machines around M3 are consequences of that constraint.

Root causes:
- Large orders at the start hit an empty line and empty stock (F3, F4)
- Supplier outage stopped the whole line (F5)
- Machine breakdowns cut capacity (F6, F7, F8, F9)
- M3 limits the output (F10)

## Proposals and how they were verified

| Round | Proposal | Cited facts | Δ SL (points) | Good parts | Scrap rate | WIP | Official check | Strict check | One-time cost (EUR) | Δ profit (EUR) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | FG stock 40 | F4, F2 | +61.0 | +0.0% | +0.0% | +0.0% | verified | yes | 0 | 33,364 |
| 1 | M3 cycle 13→12 min | F10 | +20.8 | +5.6% | -2.4% | -24.5% | verified | yes | 30,000 | 13,407 |

**Recommended:** FG stock 40 (+61.0 points service level, verified, passes the strict check).

## Facts given to the model

- **F1** Over 20 shifts: service level 29% (181 of 626 ordered units shipped on time); 32.1 good parts per shift; scrap 85 of 741 released parts (11%); average WIP 9.62; backlog at the end 0; finished-goods stock at the end 15.
- **F2** Starting finished-goods stock 0; the line starts empty. Current lever changes: none (default line). Machine breakdowns on.
- **F3** Orders per shift ranged 2–61 (average 31.3); orders exceeded the average output of 32.1 parts in shifts 1–5, 7, 13–14, 17, 19; first three shifts ordered 61, 55, 36.
- **F4** Shortfalls (orders not shipped on time) in shifts 1–17: 445 units in total; worst shift 5 (50 of 50 late). Backlog peaked at 60 units after shift 5. Late orders are served first, so a backlog also delays the following shifts.
- **F5** Supplier outage from tick 4800 to 5760 (960 min, shifts 11–12): no parts released. Good parts produced shift 11: 16, shift 12: 0, shift 13: 34.
- **F6** M1: busy 31%, blocked 27%, starved 36%, down for repair 6%; OEE 31% (availability 94%). 17 breakdowns (HDF ×11, TWF ×6), 615 min of repair, in shifts 2–6, 8, 10, 14–15, 17, 20. Starved for an hour or more in shifts 11.
- **F7** M2: busy 23%, blocked 45%, starved 32%, down for repair 0%; OEE 20% (availability 100%). 1 breakdowns (RNF ×1), 15 min of repair, in shifts 2. Starved for an hour or more in shifts 11.
- **F8** M3: busy 87%, blocked 0%, starved 8%, down for repair 5%; OEE 87% (availability 95%). 11 breakdowns (PWF ×5, RNF ×1, OSF ×5), 465 min of repair, in shifts 6–11, 15, 18–19. Starved for an hour or more in shifts 11.
- **F9** M4: busy 13%, blocked 0%, starved 87%, down for repair 0%; OEE 13% (availability 100%). 1 breakdowns (RNF ×1), 15 min of repair, in shifts 15. Starved for an hour or more in shifts 10–11, 15, 19.
- **F10** M3 is the busiest machine (87% busy, 0% blocked): it limits the line's output. Machines before it are often blocked and machines after it are often starved, which is a consequence of the constraint, not a separate problem.
