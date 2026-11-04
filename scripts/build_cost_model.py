"""Builds docs/business/cost-model.xlsx from data/rate_card.csv and results/business-inputs.csv. All costs are formulas.
Usage (from the repository root): python scripts/build_cost_model.py . docs/business/cost-model.xlsx   (needs: pip install openpyxl)
"""
import csv, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.comments import Comment

repo = sys.argv[1]
out = sys.argv[2]
F = 'Arial'
BLUE = Font(name=F, color='0000FF'); BLACK = Font(name=F); GREEN = Font(name=F, color='008000')
BOLD = Font(name=F, bold=True); TITLE = Font(name=F, bold=True, size=14); HEAD = Font(name=F, bold=True, color='FFFFFF')
HFILL = PatternFill('solid', fgColor='1F4E79'); YELLOW = PatternFill('solid', fgColor='FFFF00'); KEY = PatternFill('solid', fgColor='E2EFDA')
thin = Side(style='thin', color='BFBFBF')
EUR = '#,##0;(#,##0);-'; EUR2 = '#,##0.00;(#,##0.00);-'; PCT = '0.0%;(0.0%);-'; NUM = '#,##0.0;(#,##0.0);-'

wb = Workbook()

def header(ws, row, labels, widths=None):
    for i, l in enumerate(labels, 1):
        c = ws.cell(row=row, column=i, value=l); c.font = HEAD; c.fill = HFILL
        c.alignment = Alignment(wrap_text=True, vertical='center')
    ws.row_dimensions[row].height = 45
    if widths:
        for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w

# ── Read me ──
ws = wb.active; ws.title = 'Read me'
lines = [
    ('Cost model and KPIs – Smart Tech Components, Track B', TITLE),
    ('', None),
    ('What this workbook does', BOLD),
    ('Recomputes the cost of every scenario run with its own formulas, from the rate card (sheet Rates) and the raw quantities of the simulation runs (sheet Run data).', None),
    ('It adds the KPIs (service level, cost per good unit, total profit, OEE), the comparison of three countermeasures with one-time cost and payback, and the AI advisor running cost.', None),
    ('', None),
    ('Where the numbers come from', BOLD),
    ('Rates: data/rate_card.csv (organiser values; cycle-time and reject-rate investments are organiser assumptions).', None),
    ('Run data: results/business-inputs.csv, written by `npm run export-business` (averages of seeds 1 and 2). Every row is one scenario run and can be re-run.', None),
    ('Rules: Track B data README (cost conventions) and docs/ASSUMPTIONS.md; IDs such as COST-04 refer to that file.', None),
    ('Check: column "Check vs code" on sheet Cost model compares this workbook with the simulation code (should be 0).', None),
    ('', None),
    ('Colours', BOLD),
    ('Blue text = input (rate card, run data, assumptions). Black = formula. Green = link to another sheet. Yellow fill = key assumption you may change.', None),
    ('', None),
    ('To update', BOLD),
    ('1. Run `npm run export-business` in the repository. 2. Paste results/business-inputs.csv over sheet Run data (same columns). 3. Recalculate (F9).', None),
]
for i, (t, f) in enumerate(lines, 1):
    c = ws.cell(row=i, column=1, value=t); c.font = f or BLACK; c.alignment = Alignment(wrap_text=True)
ws.column_dimensions['A'].width = 140

# ── Rates ──
rs = wb.create_sheet('Rates')
header(rs, 1, ['Item', 'Value', 'Unit', 'Note'], [40, 14, 26, 90])
rate_rows = list(csv.DictReader(open(f'{repo}/data/rate_card.csv')))
R = {}
r = 2
for row in rate_rows:
    rs.cell(row=r, column=1, value=row['item']).font = BLACK
    c = rs.cell(row=r, column=2, value=float(row['value'])); c.font = BLUE; c.number_format = '#,##0.00'
    rs.cell(row=r, column=3, value=row['unit']).font = BLACK
    rs.cell(row=r, column=4, value=row['note']).font = BLACK
    R[row['item']] = f'Rates!$B${r}'; r += 1
r += 1
rs.cell(row=r, column=1, value='Model settings (assumptions)').font = BOLD; r += 1
extra = [
    ('amortisation_shifts', 1920, 'shifts', 'BIZ-03: 8 years x 240 shifts per year'),
    ('shifts_per_year', 240, 'shifts', 'TIME-02: one shift per working day'),
    ('fg_value_per_unit', 103, 'EUR/unit', 'COST-04: starting stock charged and end stock credited at this value'),
    ('fg_value_marginal', 45, 'EUR/unit', 'COST-13: sensitivity, end stock at the cost of one extra unit'),
    ('quarters_per_year', 4, 'periods', 'BIZ-05: annual view = 4 x scenario quarter-60'),
]
for item, v, u, n in extra:
    rs.cell(row=r, column=1, value=item).font = BLACK
    c = rs.cell(row=r, column=2, value=v); c.font = BLUE; c.fill = YELLOW
    rs.cell(row=r, column=3, value=u).font = BLACK; rs.cell(row=r, column=4, value=n).font = BLACK
    R[item] = f'Rates!$B${r}'; r += 1

# ── Run data ──
ds = wb.create_sheet('Run data')
inputs = list(csv.DictReader(open(f'{repo}/results/business-inputs.csv')))
cols = list(inputs[0].keys())
header(ds, 1, cols + ['extra_M3_machines'], [16, 14, 28] + [12] * (len(cols) - 2))
for i, row in enumerate(inputs, 2):
    for j, k in enumerate(cols, 1):
        v = row[k]
        try: v = float(v)
        except ValueError: pass
        c = ds.cell(row=i, column=j, value=v); c.font = BLUE
    n = ds.cell(row=i, column=len(cols) + 1, value=row['machines'].split().count('M3b')); n.font = BLUE
CI = {k: get_column_letter(j) for j, k in enumerate(cols + ['extra_M3_machines'], 1)}
N = len(inputs)

# ── Cost model ──
cs = wb.create_sheet('Cost model')
heads = ['Scenario', 'Option', 'Shifts', 'Machine cost', 'Material', 'Holding WIP', 'Holding FG', 'Amortised one-time',
         'Lost sales', 'Revenue', 'Start stock value', 'End stock value', 'Total profit (EUR)', 'Cost per good unit excl. FG holding',
         'Cost per good unit incl. FG holding', 'Service level', 'Line yield', 'OEE M3', 'Profit, end stock at marginal value', 'Check vs code (profit)']
header(cs, 1, heads, [16, 26, 8] + [13] * (len(heads) - 3))
for i in range(2, N + 2):
    d = lambda k: f"'Run data'!{CI[k]}{i}"
    hrs = R['shift_hours']
    f = {
        'A': f"={d('scenario')}", 'B': f"={d('label')}", 'C': f"={d('shifts')}",
        'D': f"={d('shifts')}*{hrs}*({R['machine_hour_rate_M1']}+{R['machine_hour_rate_M2']}+{R['machine_hour_rate_M3']}*(1+{d('extra_M3_machines')})+{R['machine_hour_rate_M4']})",
        'E': f"={d('released')}*{R['material_cost_per_part']}",
        'F': f"={d('wip_part_shifts')}*{R['holding_cost_wip']}*{hrs}",
        'G': f"={d('fg_stand_shifts')}*{R['holding_cost_finished_goods']}*{hrs}",
        'H': f"={d('one_time_cost_eur')}*{d('shifts')}/{R['amortisation_shifts']}",
        'I': f"=({d('ordered')}-{d('shipped_on_time')})*{R['lost_sales_penalty']}",
        'J': f"={d('shipped')}*{R['selling_price_per_good_unit']}",
        'K': f"={d('start_stock')}*{R['fg_value_per_unit']}",
        'L': f"={d('end_stock')}*{R['fg_value_per_unit']}",
        'M': f"=J{i}-D{i}-E{i}-F{i}-G{i}-H{i}-I{i}-K{i}+L{i}",
        'N': f"=IFERROR((D{i}+E{i}+F{i}+H{i})/{d('good_parts')},0)",
        'O': f"=IFERROR((D{i}+E{i}+F{i}+G{i}+H{i})/{d('good_parts')},0)",
        'P': f"=IFERROR({d('shipped_on_time')}/{d('ordered')},0)",
        'Q': f"=IFERROR({d('good_parts')}/{d('released')},0)",
        'R': f"={d('oee_M3')}",
        'S': f"=M{i}-L{i}+{d('end_stock')}*{R['fg_value_marginal']}",
        'T': f"=ROUND(M{i}-{d('code_total_profit')},0)",
    }
    for col, formula in f.items():
        c = cs[f'{col}{i}']; c.value = formula
        c.font = GREEN if col in 'ABCR' else BLACK
        c.number_format = {'C': '0', 'N': EUR2, 'O': EUR2, 'P': PCT, 'Q': PCT, 'R': PCT}.get(col, EUR)
cs.freeze_panes = 'C2'
cs['T1'].comment = Comment('Difference between this workbook and the simulation code (src/economics/cost.js). 0 = the formulas reproduce the code.', 'model')

# helper: row of (scenario, option) on Cost model
def row_of(scen, opt):
    for i, x in enumerate(inputs, 2):
        if x['scenario'] == scen and x['option'] == opt: return i
    raise KeyError((scen, opt))

# ── KPIs ──
ks = wb.create_sheet('KPIs')
header(ks, 1, ['Scenario', 'Countermeasure', 'Service level', 'Good parts per shift', 'Cost per good unit (EUR, excl. FG holding)',
               'Cost per good unit (EUR, incl. FG holding)', 'Total profit (EUR)', 'OEE M1', 'OEE M2', 'OEE M3', 'OEE M4', 'Availability M3'],
       [16, 28, 12, 12, 16, 16, 14, 10, 10, 10, 10, 12])
rec = {'baseline': 'none', 'supplier-outage': 'm3-ct12-fg30', 'demand-swing': 'fg60', 'both': 'fg60', 'quarter-60': 'fg60'}
k = 2
for scen, opt in rec.items():
    for o in (['none'] if opt == 'none' else ['none', opt]):
        i = row_of(scen, o); d = lambda c: f"'Run data'!{CI[c]}{i}"
        vals = [f"='Cost model'!A{i}", f"='Cost model'!B{i}", f"='Cost model'!P{i}", f"={d('good_parts')}/{d('shifts')}",
                f"='Cost model'!N{i}", f"='Cost model'!O{i}", f"='Cost model'!M{i}", f"={d('oee_M1')}", f"={d('oee_M2')}",
                f"={d('oee_M3')}", f"={d('oee_M4')}", f"={d('availability_M3')}"]
        fmts = [None, None, PCT, NUM, EUR2, EUR2, EUR, PCT, PCT, PCT, PCT, PCT]
        for j, (v, fm) in enumerate(zip(vals, fmts), 1):
            c = ks.cell(row=k, column=j, value=v); c.font = GREEN
            if fm: c.number_format = fm
        k += 1
ks.cell(row=k + 1, column=1, value='OEE per machine = availability x performance x quality (README). M1, M2 and M4 are low because they wait for the bottleneck M3; quarter-60 includes breakdowns, so availability < 100%.').font = Font(name=F, italic=True)

# ── Countermeasure comparison ──
cc = wb.create_sheet('Comparison')
header(cc, 1, ['Option', 'One-time cost (EUR)', 'Scenario', 'Service level without', 'Service level with', 'Δ service level (points)',
               'Profit without (EUR)', 'Profit with (EUR)', 'Δ profit per period (EUR)', 'Shifts in period'],
       [30, 14, 16, 12, 12, 12, 14, 14, 14, 10])
options = [('fg60', 'Finished-goods stock 60'), ('m3-ct12-fg30', 'M3 12 min + stock 30'), ('extra-m3', 'Extra machine at M3')]
r = 2
blocks = {}
for opt, label in options:
    start = r
    for scen in ['supplier-outage', 'demand-swing', 'both', 'quarter-60']:
        i0, i1 = row_of(scen, 'none'), row_of(scen, opt)
        vals = [label, f"='Run data'!{CI['one_time_cost_eur']}{i1}", scen, f"='Cost model'!P{i0}", f"='Cost model'!P{i1}",
                f"=(E{r}-D{r})*100", f"='Cost model'!M{i0}", f"='Cost model'!M{i1}", f"=H{r}-G{r}", f"='Cost model'!C{i1}"]
        fm = [None, EUR, None, PCT, PCT, NUM, EUR, EUR, EUR, '0']
        for j, (v, f2) in enumerate(zip(vals, fm), 1):
            c = cc.cell(row=r, column=j, value=v); c.font = GREEN if isinstance(v, str) and v.startswith("='") else BLACK
            if f2: c.number_format = f2
        if scen == 'quarter-60': blocks[opt] = (r, i0, i1)
        r += 1
    r += 1
r += 1
cc.cell(row=r, column=1, value='Annual view and payback (BIZ-05: 4 x quarter-60, with breakdowns and one outage per quarter)').font = BOLD; r += 1
hdr = ['Option', 'One-time cost (EUR)', 'Annual Δ profit (EUR)', 'Payback (years)', 'Annual Δ profit, end stock at marginal value (EUR)', 'Payback at marginal value (years)']
for j, h in enumerate(hdr, 1):
    c = cc.cell(row=r, column=j, value=h); c.font = HEAD; c.fill = HFILL; c.alignment = Alignment(wrap_text=True)
cc.row_dimensions[r].height = 45; r += 1
first_annual = r
for opt, label in options:
    qr, i0, i1 = blocks[opt]
    amort = f"B{r}*{R['shifts_per_year']}/{R['amortisation_shifts']}"
    vals = [label, f"=B{qr}", f"=I{qr}*{R['quarters_per_year']}",
            f'=IF(B{r}=0,"no investment",IF(C{r}+{amort}>0,B{r}/(C{r}+{amort}),"not reached"))',
            f"=('Cost model'!S{i1}-'Cost model'!S{i0})*{R['quarters_per_year']}",
            f'=IF(B{r}=0,"no investment",IF(E{r}+{amort}>0,B{r}/(E{r}+{amort}),"not reached"))']
    fm = [None, EUR, EUR, '0.0', EUR, '0.0']
    for j, (v, f2) in enumerate(zip(vals, fm), 1):
        c = cc.cell(row=r, column=j, value=v); c.font = BLACK; c.number_format = f2 or 'General'
        if j in (3, 5): c.fill = KEY
    r += 1
r += 1
notes = [
    'Payback = one-time cost ÷ (annual profit gain + annual amortisation), i.e. the gain before the investment is spread over 8 years. "Payback not reached" is a valid result.',
    'Profit includes the lost-sales penalty (EUR 90 per late unit), holding of WIP and finished goods, and the amortised one-time cost (data README rules).',
    'The marginal-value columns value the stock left at the end at EUR 45 instead of 103 (COST-13): the line always runs flat out, so options that overproduce look better at 103.',
    'Starting stock is charged and credited at EUR 103 (COST-04); building it in reality takes about 11 shifts of spare capacity (COST-05, open point).',
]
for n in notes:
    cc.cell(row=r, column=1, value=n).font = Font(name=F, italic=True); r += 1

# ── Sensitivity: lost-sales penalty (COST-03) ──
se = wb.create_sheet('Sensitivity')
header(se, 1, ['Scenario', 'Option', 'Δ profit, penalty low', 'Δ profit, penalty base', 'Δ profit, penalty high'], [16, 28, 18, 18, 18])
se['G1'] = 'Penalty (EUR per late set)'; se['G1'].font = BOLD
for j, (lab, v) in enumerate([('low', 45), ('base', 90), ('high', 135)]):
    se.cell(row=2 + j, column=7, value=lab).font = BLACK
    c = se.cell(row=2 + j, column=8, value=v); c.font = BLUE; c.fill = YELLOW
r = 2
for scen in ['both', 'quarter-60']:
    for opt, label in [('fg60', 'Finished-goods stock 60'), ('m3-ct12-fg30', 'M3 12 min + stock 30'), ('m3-ct12', 'M3 12 min alone'), ('extra-m3', 'Extra machine at M3')]:
        i0, i1 = row_of(scen, 'none'), row_of(scen, opt)
        late = lambda i: f"('Run data'!{CI['ordered']}{i}-'Run data'!{CI['shipped_on_time']}{i})"
        se.cell(row=r, column=1, value=scen).font = BLACK; se.cell(row=r, column=2, value=label).font = BLACK
        for j, pc in enumerate(['$H$2', '$H$3', '$H$4']):
            f = f"=('Cost model'!M{i1}+{late(i1)}*({R['lost_sales_penalty']}-{pc}))-('Cost model'!M{i0}+{late(i0)}*({R['lost_sales_penalty']}-{pc}))"
            c = se.cell(row=r, column=3 + j, value=f); c.font = BLACK; c.number_format = EUR
        r += 1
se.cell(row=r + 1, column=1, value='Δ profit per period against no countermeasure, recomputed with a different lost-sales penalty (base = rate card EUR 90). Finished-goods stock stays the best option in quarter-60 and the extra machine stays negative across the range.').font = Font(name=F, italic=True)

# ── AI cost ──
ai = wb.create_sheet('AI cost')
header(ai, 1, ['Item', 'Value', 'Unit', 'Source / reasoning'], [44, 14, 22, 100])
items = [
    ('Input tokens per AI call', 1661, 'tokens', 'Measured: average of 10 calls, gpt-4o, prompt v2 (results/advisor-eval/eval-log.jsonl)', True),
    ('Output tokens per AI call', 417, 'tokens', 'Measured: same log', True),
    ('AI calls per advisor run', 1.0, 'calls', 'Measured: prompt v2 needed 1.0 rounds per case on the 10-case test set', True),
    ('Advisor runs per shift', 1, 'runs', 'Assumption ADV-03: once per shift at handover (revision rounds counted above)', True),
    ('Price per 1M input tokens', 2.50, 'USD', 'Assumption ADV-05: public OpenAI list price for gpt-4o (checked 4 Nov 2026); the organisers\' endpoint gives no price', True),
    ('Price per 1M output tokens', 10.00, 'USD', 'Assumption ADV-05: public OpenAI list price for gpt-4o', True),
    ('USD per EUR', 1.0, 'rate', 'Assumption: 1:1 for simplicity; the amounts are tiny', True),
]
for i, (n, v, u, s, inp) in enumerate(items, 2):
    ai.cell(row=i, column=1, value=n).font = BLACK
    c = ai.cell(row=i, column=2, value=v); c.font = BLUE; c.fill = YELLOW
    ai.cell(row=i, column=3, value=u).font = BLACK; ai.cell(row=i, column=4, value=s).font = BLACK
calc = [
    ('Cost per advisor run (EUR)', '=B4*(B2*B6+B3*B7)/1000000/B8', 'EUR', '0.0000'),
    ('Cost per shift (EUR)', '=B10*B5', 'EUR', '0.0000'),
    ('Cost per year (EUR)', f"=B11*{R['shifts_per_year']}", 'EUR', '#,##0.00'),
    ('Machine cost per shift, for comparison (EUR)', f"={R['shift_hours']}*({R['machine_hour_rate_M1']}+{R['machine_hour_rate_M2']}+{R['machine_hour_rate_M3']}+{R['machine_hour_rate_M4']})", 'EUR', '#,##0'),
    ('AI cost as share of machine cost', '=B11/B13', '', '0.000%'),
]
for i, (n, fml, u, fm) in enumerate(calc, 10):
    ai.cell(row=i, column=1, value=n).font = BOLD
    c = ai.cell(row=i, column=2, value=fml); c.font = BLACK; c.number_format = fm
    ai.cell(row=i, column=3, value=u).font = BLACK
ai.cell(row=16, column=1, value='Not included (assumptions ADV-09, ADV-10): IT upkeep of the advisor (about 4 h/month) and plant-manager time saved; both are small, low-confidence estimates.').font = Font(name=F, italic=True)

for sh in wb.worksheets:
    for row in sh.iter_rows():
        for c in row:
            if c.font is None or c.font.name != F:
                c.font = Font(name=F, bold=c.font.bold if c.font else False, italic=c.font.italic if c.font else False,
                              color=c.font.color if c.font else None, size=c.font.size if c.font else 11)
wb.save(out)
print('saved', out)
