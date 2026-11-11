// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../js/calc.js');

test('holdingMetrics computes value, gain and day change', () => {
  const m = Calc.holdingMetrics({ quantity: 10, avgCost: 100, price: 120, prevClose: 110 });
  assert.equal(m.value, 1200);
  assert.equal(m.cost, 1000);
  assert.equal(m.gain, 200);
  assert.equal(m.gainPct, 20);
  assert.equal(m.dayChange, 100);
  assert.ok(Math.abs(m.dayPct - 9.0909) < 1e-3);
});

test('holdingMetrics handles missing prevClose and zero cost', () => {
  const m = Calc.holdingMetrics({ quantity: 5, avgCost: 0, price: 2 });
  assert.equal(m.gainPct, 0);
  assert.equal(m.dayChange, 0);
});

test('portfolioTotals aggregates holdings', () => {
  const t = Calc.portfolioTotals([
    { quantity: 10, avgCost: 100, price: 120, prevClose: 110 },
    { quantity: 1, avgCost: 500, price: 400, prevClose: 0 },
  ]);
  assert.equal(t.value, 1600);
  assert.equal(t.cost, 1500);
  assert.equal(t.gain, 100);
  assert.equal(t.dayChange, 100);
  assert.ok(Math.abs(t.dayPct - (100 / 1500) * 100) < 1e-9);
});

test('allocation groups by type and sorts', () => {
  const a = Calc.allocation([
    { type: 'stock', symbol: 'A', quantity: 1, price: 100 },
    { type: 'crypto', symbol: 'B', quantity: 1, price: 300 },
    { type: 'stock', symbol: 'C', quantity: 1, price: 100 },
  ], 'type');
  assert.deepEqual(a.map((x) => x.label), ['crypto', 'stock']);
  assert.equal(a[0].pct, 60);
});

test('upsertSnapshot replaces same-day entry and sorts', () => {
  let h = Calc.upsertSnapshot([], '2026-01-02', 10, 5);
  h = Calc.upsertSnapshot(h, '2026-01-01', 9, 5);
  h = Calc.upsertSnapshot(h, '2026-01-02', 11, 5);
  assert.deepEqual(h.map((s) => [s.d, s.v]), [['2026-01-01', 9], ['2026-01-02', 11]]);
});

test('filterHistory limits range', () => {
  const hist = [{ d: '2025-01-01' }, { d: '2026-10-20' }, { d: '2026-11-10' }];
  const r = Calc.filterHistory(hist, '1M', new Date(2026, 10, 11));
  assert.deepEqual(r.map((s) => s.d), ['2026-10-20', '2026-11-10']);
  assert.equal(Calc.filterHistory(hist, 'ALL').length, 3);
});

test('mergeBuy computes weighted average cost', () => {
  assert.deepEqual(Calc.mergeBuy(10, 100, 10, 200), { quantity: 20, avgCost: 150 });
});

test('toCSV escapes commas and quotes', () => {
  const csv = Calc.toCSV([{ type: 'stock', symbol: 'X', name: 'Foo, "Bar"', quantity: 1, avgCost: 1, price: 2 }]);
  assert.match(csv, /"Foo, ""Bar"""/);
});

test('reinvested dividend on a fixed-price fund adds units and shows as gain', () => {
  const h = { quantity: 10000, avgCost: 1, price: 1 };
  Calc.recordDividend(h, { amount: 550, date: '2026-01-01', reinvest: true, unitPrice: 1 });
  assert.equal(h.quantity, 10550);
  const m = Calc.holdingMetrics(h);
  assert.ok(Math.abs(m.cost - 10000) < 1e-9);
  assert.ok(Math.abs(m.gain - 550) < 1e-9);
  assert.ok(Math.abs(m.gainPct - 5.5) < 1e-9);
  assert.equal(m.dividends, 550);
});

test('cash dividend counts as income in gain', () => {
  const h = { quantity: 100, avgCost: 10, price: 10 };
  Calc.recordDividend(h, { amount: 25, date: '2026-01-01', reinvest: false });
  assert.equal(h.quantity, 100);
  const m = Calc.holdingMetrics(h);
  assert.equal(m.gain, 25);
  assert.equal(Calc.portfolioTotals([h]).dividends, 25);
});

test('ASNB fund lookup', () => {
  const ASNB = require('../js/asnb.js');
  assert.equal(ASNB.find('asb').fixed, true);
  assert.equal(ASNB.find('ASN Equity 5'), null);
  assert.equal(ASNB.find('ASNE5').fixed, false);
});
