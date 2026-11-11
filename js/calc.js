/* Pure portfolio calculations. Works in the browser (window.Calc) and in Node (module.exports). */
(function (root) {
  'use strict';

  const num = (v) => (Number.isFinite(+v) ? +v : 0);

  function holdingMetrics(h) {
    const qty = num(h.quantity);
    const price = num(h.price);
    const avgCost = num(h.avgCost);
    const prev = num(h.prevClose);
    const value = qty * price;
    const cost = qty * avgCost;
    const gain = value - cost;
    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
    const dayChange = prev > 0 ? qty * (price - prev) : 0;
    const dayPct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    return { value, cost, gain, gainPct, dayChange, dayPct };
  }

  function portfolioTotals(holdings) {
    let value = 0, cost = 0, dayChange = 0, prevValue = 0;
    for (const h of holdings) {
      const m = holdingMetrics(h);
      value += m.value;
      cost += m.cost;
      dayChange += m.dayChange;
      prevValue += m.value - m.dayChange;
    }
    const gain = value - cost;
    return {
      value,
      cost,
      gain,
      gainPct: cost > 0 ? (gain / cost) * 100 : 0,
      dayChange,
      dayPct: prevValue > 0 ? (dayChange / prevValue) * 100 : 0,
      count: holdings.length,
    };
  }

  /** Group holding values by 'type' or by individual holding ('holding'). Sorted desc, with pct. */
  function allocation(holdings, by) {
    const map = new Map();
    for (const h of holdings) {
      const key = by === 'type' ? h.type : (h.symbol || h.name || h.id);
      const { value } = holdingMetrics(h);
      if (value <= 0) continue;
      map.set(key, (map.get(key) || 0) + value);
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0);
    return [...map.entries()]
      .map(([label, value]) => ({ label, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }

  /** Insert or replace the snapshot for `date` (YYYY-MM-DD). Returns a new, date-sorted array. */
  function upsertSnapshot(history, date, value, cost) {
    const out = history.filter((s) => s.d !== date);
    out.push({ d: date, v: Math.round(value * 100) / 100, c: Math.round(cost * 100) / 100 });
    out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    return out;
  }

  /** Keep snapshots within `range` ('1M','3M','6M','1Y','ALL') relative to `today` (Date). */
  function filterHistory(history, range, today) {
    const days = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366 }[range];
    if (!days) return history.slice();
    const t = today || new Date();
    const from = new Date(t.getFullYear(), t.getMonth(), t.getDate() - days);
    const fromStr = isoDate(from);
    return history.filter((s) => s.d >= fromStr);
  }

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Merge a buy into an existing position: new qty and weighted average cost. */
  function mergeBuy(qty, avgCost, addQty, addPrice) {
    const q = num(qty) + num(addQty);
    if (q <= 0) return { quantity: 0, avgCost: 0 };
    return { quantity: q, avgCost: (num(qty) * num(avgCost) + num(addQty) * num(addPrice)) / q };
  }

  function toCSV(holdings) {
    const cols = ['type', 'symbol', 'name', 'quantity', 'avgCost', 'price', 'value', 'cost', 'gain', 'gainPct'];
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = holdings.map((h) => {
      const m = holdingMetrics(h);
      return [h.type, h.symbol, h.name, h.quantity, h.avgCost, h.price,
        m.value.toFixed(2), m.cost.toFixed(2), m.gain.toFixed(2), m.gainPct.toFixed(2)].map(esc).join(',');
    });
    return [cols.join(','), ...rows].join('\n');
  }

  const api = { holdingMetrics, portfolioTotals, allocation, upsertSnapshot, filterHistory, isoDate, mergeBuy, toCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
