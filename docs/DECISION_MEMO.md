# Decision memo – supplier outages and demand swings

**To:** Plant manager, Smart Tech Components · **From:** Track B consulting team · **Date:** 4 November 2026

## Recommendation
1. **Hold a finished-goods safety stock of 60 stand-and-frame sets** and refill it after every outage or demand peak. No investment is needed.
2. **Do not buy a second assembly machine (M3).** It never pays back in any scenario we tested.
3. **Postpone the M3 speed-up (13 → 12 min, EUR 30,000)** until the line has a release rule that stops overproduction. Most of its apparent profit is extra stock that nobody ordered.
4. **Use the AI shift advisor at every shift handover.** It explains disruptions from the facts of the shift, and every change it proposes is checked in the simulation before you see it.

## Expected effect
| | Without | With 60 sets of stock | Source |
|---|---|---|---|
| On-time delivery, realistic quarter (60 shifts, one outage, breakdowns) | 73.2% | **99.6%** | quarter-60 [1] |
| On-time delivery, outage + demand swing (reference "both") | 47.2% | **100%** | both [1] |
| Profit per quarter | EUR 75,440 | **EUR 108,142** | quarter-60 [2] |
| Profit gain per year (4 quarters) | – | **+EUR 130,808** (+EUR 116,888 if leftover stock is valued at its real cost) | [2] [3] |

For comparison:
- **M3 12 min + 30 sets of stock:** +EUR 94,633 a year (+56,005 at real stock value), payback 0.3–0.5 years.
- **Extra M3 machine:** −EUR 129,988 a year; payback is never reached [2] [3].

## Cost
- **No investment.** The stock ties up about EUR 6,200 (60 × EUR 103) and costs EUR 0.50 per set per hour to hold. That holding cost is already included in the profit figures above [2].
- **AI advisor:** about 2,100 tokens and 4 seconds per diagnosis, about **EUR 0.008 per shift, or about EUR 2 a year** at the gpt-4o list price [3, sheet AI cost].

## Key risks
- **Building the stock takes time.** Without breakdowns the line has about 5.6 sets of spare capacity per shift (36.8 made vs 31.2 ordered), so 60 sets take about **11 shifts**. With breakdowns it is only about 2 sets per shift (33.3 made in quarter-60), so building or refilling 60 sets takes about **29 shifts** [1] [ASSUMPTIONS COST-05]. Start now, and refill before the next order peak.
- **Assumptions drive the size of the gain.** With a late-order penalty of EUR 45 instead of 90, stock still gains EUR 10,472 per quarter, and the extra machine stays negative from EUR 45 to EUR 135 [3, sheet Sensitivity]. Four outages a year (SUP-02) is our assumption and not yet tested across a range.
- **The line has no production control.** It always runs at full speed, so stock piles up when demand is low. A release rule (stop when stock reaches the target) is the next improvement.
- **Advisor accuracy.** On 10 test cases with known causes, the advisor named the right main cause in **80%** of cases (40% for a rule-based baseline) and made **no** invalid proposals [4]. Because every proposal is re-simulated, a wrong diagnosis cannot turn into an unverified change.

## Sources
[1] `results/scenario-results.md` · [2] `results/countermeasure-comparison.md` · [3] `docs/business/cost-model.xlsx` (sheets Comparison, AI cost) · [4] `results/advisor-eval/summary.md` (gpt-4o, prompt v2).

All runs use seeds 1 and 2 and can be re-run with `npm run scenarios`, `npm run export-business` and `npm run evaluate`. Assumptions: `docs/ASSUMPTIONS.md`.
