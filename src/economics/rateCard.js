/**
 * rateCard.js
 * Loads data/rate_card.csv (assumption COST-01) into a plain object:
 *   { machine_hour_rate_M1: 85, material_cost_per_part: 38, ... }
 * The CSV has quoted notes that contain commas, so it is parsed properly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const RATE_CARD_PATH = path.join(here, '..', '..', 'data', 'rate_card.csv');

// Minimal RFC 4180 parser: quoted fields, "" inside quotes, CRLF or LF line ends.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

const REQUIRED = [
  'shift_hours', 'machine_hour_rate_M1', 'machine_hour_rate_M2', 'machine_hour_rate_M3', 'machine_hour_rate_M4',
  'material_cost_per_part', 'selling_price_per_good_unit', 'holding_cost_wip', 'holding_cost_finished_goods',
  'lost_sales_penalty', 'extra_buffer_slot', 'parallel_machine_investment', 'cycle_time_reduction_investment',
  'reject_rate_reduction_investment',
];

export function loadRateCard(csvPath = RATE_CARD_PATH) {
  const [header, ...rows] = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const iItem = header.indexOf('item'), iValue = header.indexOf('value');
  if (iItem < 0 || iValue < 0) throw new Error(`${csvPath}: needs columns item and value`);
  const rates = {};
  for (const r of rows) {
    const v = Number(r[iValue]);
    if (!Number.isFinite(v)) throw new Error(`${csvPath}: value of ${r[iItem]} is not a number`);
    rates[r[iItem]] = v;
  }
  const missing = REQUIRED.filter((k) => !(k in rates));
  if (missing.length) throw new Error(`${csvPath}: missing items ${missing.join(', ')}`);
  return rates;
}
