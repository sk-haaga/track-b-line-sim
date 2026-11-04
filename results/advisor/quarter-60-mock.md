# Shift advisor report: quarter-60

Model: mock-rules (mock), prompt v1; 1 round(s); 0 tokens; 0.0 s for the model calls.
Without changes: service level 73.3%, 33.3 good parts per shift (seeds 1–2).

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
| 1 | FG stock 40 | F4, F2 | +21.4 | +0.0% | +0.0% | +0.0% | verified | yes | 0 | 28,713 |
| 1 | M3 cycle 13→12 min | F10 | +8.0 | +6.8% | +0.5% | -14.1% | verified | yes | 30,000 | 6,971 |

**Recommended:** FG stock 40 (+21.4 points service level, verified, passes the strict check).

## Facts given to the model

- **F1** Over 60 shifts: service level 76% (1429 of 1874 ordered units shipped on time); 33.7 good parts per shift; scrap 224 of 2259 released parts (10%); average WIP 13.23; backlog at the end 0; finished-goods stock at the end 146.
- **F2** Starting finished-goods stock 0; the line starts empty. Current lever changes: none (default line). Machine breakdowns on.
- **F3** Orders per shift ranged 0–75 (average 31.2); orders exceeded the average output of 33.7 parts in shifts 1–5, 7, 13, 17, 19, 28–29, 31–33, 35, 37–39, 41, 43, 45–46, 48, 51–52, 54–57; first three shifts ordered 61, 55, 36.
- **F4** Shortfalls (orders not shipped on time) in shifts 1–17: 445 units in total; worst shift 5 (50 of 50 late). Backlog peaked at 60 units after shift 5. Late orders are served first, so a backlog also delays the following shifts.
- **F5** Supplier outage from tick 4800 to 5760 (960 min, shifts 11–12): no parts released. Good parts produced shift 11: 16, shift 12: 0, shift 13: 34.
- **F6** M1: busy 31%, blocked 51%, starved 13%, down for repair 5%; OEE 31% (availability 95%). 37 breakdowns (HDF ×28, TWF ×8, RNF ×1), 1435 min of repair, in shifts 2–6, 8, 10, 14–15, 17, 20, 23, 26–27, 29–32, 36–37, 42, 46, 48, 50, 52, 54, 57, 59. Starved for an hour or more in shifts 11.
- **F7** M2: busy 24%, blocked 66%, starved 11%, down for repair 0%; OEE 21% (availability 100%). 4 breakdowns (RNF ×4), 60 min of repair, in shifts 2, 28, 40, 57. Starved for an hour or more in shifts 11.
- **F8** M3: busy 91%, blocked 0%, starved 3%, down for repair 6%; OEE 91% (availability 94%). 44 breakdowns (PWF ×24, RNF ×4, OSF ×16), 1740 min of repair, in shifts 6–11, 15, 18–19, 22–23, 26–28, 30, 32–36, 40, 42–43, 48–49, 51, 54–56, 59–60. Starved for an hour or more in shifts 11.
- **F9** M4: busy 14%, blocked 0%, starved 86%, down for repair 0%; OEE 14% (availability 100%). 6 breakdowns (RNF ×6), 90 min of repair, in shifts 15, 25–27, 43, 54. Starved for an hour or more in shifts 10–11, 15, 19, 22, 26, 28, 34, 49, 51, 54–55, 59–60.
- **F10** M3 is the busiest machine (91% busy, 0% blocked): it limits the line's output. Machines before it are often blocked and machines after it are often starved, which is a consequence of the constraint, not a separate problem.
