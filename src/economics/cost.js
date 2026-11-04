/**
 * cost.js
 * Cost model of the Track B data README, applied to one runHeadless result.
 * Pure functions: no file access (rates are passed in, see rateCard.js).
 *
 * Rules (IDs refer to docs/ASSUMPTIONS.md):
 *   machine cost    every scheduled hour of every machine, working or waiting (MAC-06); spawned machines (M3b) pay the
 *                   hour rate of their station
 *   material        released parts x material_cost_per_part (scrap is inside this total)
 *   holding WIP     sum over shifts of the average parts in the line x holding_cost_wip x shift_hours
 *   holding FG      average stock of shift s = stock after shipping in shift s-1 (initial stock for s = 1) plus half of
 *                   the production of shift s; x holding_cost_finished_goods x shift_hours
 *   one-time costs  amortised over 1,920 shifts (8 years x 240 shifts, BIZ-03); a run of n shifts carries n / 1,920
 *   lost sales      each ordered unit not shipped by its due tick, once (COST-03)
 *   revenue         units shipped x selling price
 *   stock value     starting stock charged and end stock credited at EUR 103 per unit (COST-04)
 *
 * Two costs per good unit are reported (COST-10):
 *   costPerGoodUnitExFg  (machine + material + WIP holding + amortised) / good units: the organiser's baseline check,
 *                        EUR 102.8 for the default line
 *   costPerGoodUnit      the same plus finished-goods holding: compares options that hold stock like with like
 */

export const AMORTISATION_SHIFTS = 1920;   // 8 years x 240 shifts per year (BIZ-03)
export const FG_VALUE_PER_UNIT = 103;      // baseline cost per good unit 102.8, rounded (COST-04)

// 'M3b' → 'M3': spawned parallel machines pay the hour rate of their station's original machine.
export function rateKeyFor(machineId) {
  const m = /^(M\d+)/.exec(machineId);
  if (!m) throw new Error(`no hour rate for machine id ${machineId}`);
  return `machine_hour_rate_${m[1]}`;
}

/**
 * computeCosts(result, opts) → cost breakdown and KPIs
 *   result  output of runHeadless
 *   opts    { rates, initialFinishedGoods = 0, oneTimeCosts = 0, fgValue = FG_VALUE_PER_UNIT }
 */
export function computeCosts(result, { rates, initialFinishedGoods = 0, oneTimeCosts = 0, fgValue = FG_VALUE_PER_UNIT } = {}) {
  if (!rates) throw new Error('computeCosts needs rates (loadRateCard())');
  const { perShift, kpis } = result;
  const shifts = perShift.length;
  const hours = rates.shift_hours;

  const machineIds = Object.keys(kpis.machines);
  const machineCost = machineIds.reduce((sum, id) => sum + rates[rateKeyFor(id)] * hours * shifts, 0);
  const materialCost = kpis.released * rates.material_cost_per_part;
  const holdingWip = perShift.reduce((s, r) => s + r.wip, 0) * rates.holding_cost_wip * hours;

  let prevStock = initialFinishedGoods, fgUnitShifts = 0;
  for (const r of perShift) {
    fgUnitShifts += prevStock + r.produced / 2;
    prevStock = r.stock;
  }
  const holdingFg = fgUnitShifts * rates.holding_cost_finished_goods * hours;

  const amortised = oneTimeCosts * shifts / AMORTISATION_SHIFTS;
  const shipped = perShift.reduce((s, r) => s + r.shipped, 0);
  const shippedOnTime = perShift.reduce((s, r) => s + r.shippedOnTime, 0);
  const lateUnits = kpis.ordered - shippedOnTime;
  const lostSales = lateUnits * rates.lost_sales_penalty;
  const revenue = shipped * rates.selling_price_per_good_unit;
  const startStockValue = initialFinishedGoods * fgValue;
  const endStockValue = kpis.finishedGoodsEnd * fgValue;

  const good = Math.max(1, kpis.goodParts);
  const totalProfit = revenue - machineCost - materialCost - holdingWip - holdingFg - amortised - lostSales
    - startStockValue + endStockValue;

  const round2 = (x) => Math.round(x * 100) / 100;
  return {
    shifts,
    revenue: round2(revenue),
    machineCost: round2(machineCost),
    materialCost: round2(materialCost),
    holdingWip: round2(holdingWip),
    holdingFg: round2(holdingFg),
    amortisedOneTime: round2(amortised),
    lostSales: round2(lostSales),
    startStockValue: round2(startStockValue),
    endStockValue: round2(endStockValue),
    totalProfit: round2(totalProfit),
    costPerGoodUnitExFg: round2((machineCost + materialCost + holdingWip + amortised) / good),
    costPerGoodUnit: round2((machineCost + materialCost + holdingWip + holdingFg + amortised) / good),
    shipped,
    shippedOnTime,
    lateUnits,
  };
}
