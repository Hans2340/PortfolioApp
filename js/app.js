/* Portfolio Monitor — UI and state. */
(function () {
  'use strict';

  const TYPES = {
    stock: { label: 'Stock', color: '#3b82f6' },
    etf: { label: 'ETF', color: '#14b8a6' },
    fund: { label: 'Mutual fund', color: '#8b5cf6' },
    asnb: { label: 'ASNB', color: '#0ea5e9' },
    crypto: { label: 'Crypto', color: '#f59e0b' },
    bond: { label: 'Bond', color: '#64748b' },
    commodity: { label: 'Commodity / Gold', color: '#eab308' },
    property: { label: 'Property', color: '#ec4899' },
    cash: { label: 'Cash / Deposit', color: '#22c55e' },
    other: { label: 'Other', color: '#94a3b8' },
  };
  const PALETTE = ['#3b82f6', '#f59e0b', '#14b8a6', '#8b5cf6', '#ec4899', '#22c55e',
    '#ef4444', '#06b6d4', '#a3e635', '#f97316'];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let state = Storage.load();
  const ui = { range: 'ALL', allocBy: 'type', search: '', type: '', sort: 'value', tradeSide: 'buy', tradeId: null };
  let refreshTimer = null;
  let refreshing = false;

  // ---------- formatting ----------
  function money(n, opts = {}) {
    const abs = Math.abs(n);
    const digits = opts.price && abs > 0 && abs < 1 ? { maximumSignificantDigits: 4 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: state.settings.currency, ...digits }).format(n);
    } catch (e) {
      return `${state.settings.currency} ${n.toFixed(2)}`;
    }
  }
  const signed = (n, f) => (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n));
  const pct = (n) => signed(n, (v) => `${v.toFixed(2)}%`);
  const qtyFmt = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(n);
  const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shortDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });
  };

  // ---------- persistence ----------
  function persist() {
    const active = state.holdings;
    if (active.length) {
      const t = Calc.portfolioTotals(active);
      state.history = Calc.upsertSnapshot(state.history, Calc.isoDate(new Date()), t.value, t.cost);
    }
    Storage.save(state);
  }

  // ---------- rendering ----------
  function render() {
    renderSummary();
    renderPerformance();
    renderAllocation();
    renderHoldings();
    renderLastUpdated();
  }

  function renderSummary() {
    const t = Calc.portfolioTotals(state.holdings);
    $('#totalValue').textContent = money(t.value);
    $('#totalCount').textContent = `${t.count} holding${t.count === 1 ? '' : 's'}`;

    setStat('#dayChange', signed(t.dayChange, money), tone(t.dayChange));
    setStat('#dayPct', pct(t.dayPct), tone(t.dayChange));
    setStat('#totalGain', signed(t.gain, money), tone(t.gain));
    setStat('#totalGainPct', pct(t.gainPct), tone(t.gain));
    if (t.dividends > 0) $('#totalGainPct').insertAdjacentHTML('beforeend', ` <span class="muted">· incl. ${money(t.dividends)} dividends</span>`);
    $('#totalCost').textContent = money(t.cost);

    const ranked = state.holdings.map((h) => ({ h, m: Calc.holdingMetrics(h) })).filter((x) => x.m.cost > 0 && x.h.type !== 'cash')
      .sort((a, b) => b.m.gainPct - a.m.gainPct);
    $('#bestWorst').innerHTML = ranked.length > 1
      ? `Best <b class="${tone(ranked[0].m.gainPct)}">${esc(ranked[0].h.symbol)} ${pct(ranked[0].m.gainPct)}</b> · ` +
        `Worst <b class="${tone(ranked.at(-1).m.gainPct)}">${esc(ranked.at(-1).h.symbol)} ${pct(ranked.at(-1).m.gainPct)}</b>`
      : '';
  }

  function setStat(sel, text, cls) {
    const n = $(sel);
    n.textContent = text;
    n.classList.remove('pos', 'neg');
    if (cls) n.classList.add(cls);
  }

  function renderPerformance() {
    const hist = Calc.filterHistory(state.history, ui.range, new Date());
    const points = hist.map((s) => ({ x: s.d, y: s.v, y2: s.c }));
    Charts.lineChart($('#lineChart'), points, { format: money, formatX: shortDate });
    const pc = $('#perfChange');
    if (hist.length >= 2) {
      const first = hist[0], last = hist.at(-1);
      // Return over the period, net of money added or withdrawn.
      const flow = last.c - first.c;
      const diff = last.v - first.v - flow;
      const base = first.v + Math.max(flow, 0);
      const r = base > 0 ? (diff / base) * 100 : 0;
      pc.innerHTML = `<span class="${tone(diff)}">${signed(diff, money)} (${pct(r)})</span> <span class="muted">since ${shortDate(first.d)}, excluding deposits</span>`;
    } else {
      pc.textContent = '';
    }
  }

  function renderAllocation() {
    const data = Calc.allocation(state.holdings, ui.allocBy);
    let slices = data;
    if (ui.allocBy === 'holding' && data.length > 8) {
      const rest = data.slice(7);
      slices = data.slice(0, 7).concat([{ label: 'Others', value: rest.reduce((a, b) => a + b.value, 0), pct: rest.reduce((a, b) => a + b.pct, 0) }]);
    }
    slices = slices.map((s, i) => ({
      ...s,
      color: ui.allocBy === 'type' ? (TYPES[s.label] || TYPES.other).color : (s.label === 'Others' ? '#94a3b8' : PALETTE[i % PALETTE.length]),
      name: ui.allocBy === 'type' ? (TYPES[s.label] || TYPES.other).label : s.label,
    }));
    Charts.donutChart($('#donut'), slices, slices.length ? `${slices.length}` : '—',
      ui.allocBy === 'type' ? (slices.length === 1 ? 'asset class' : 'asset classes') : (slices.length === 1 ? 'holding' : 'positions'));
    $('#legend').innerHTML = slices.length
      ? slices.map((s) => `<li><i class="sw" style="background:${s.color}"></i><span class="lg-name">${esc(s.name)}</span>
          <span class="lg-pct">${s.pct.toFixed(1)}%</span><span class="lg-val">${money(s.value)}</span></li>`).join('')
      : `<li class="muted">Nothing to show yet.</li>`;
  }

  function filteredHoldings() {
    const q = ui.search.trim().toLowerCase();
    const rows = state.holdings
      .filter((h) => !ui.type || h.type === ui.type)
      .filter((h) => !q || `${h.symbol} ${h.name} ${h.notes || ''}`.toLowerCase().includes(q))
      .map((h) => ({ h, m: Calc.holdingMetrics(h) }));
    const key = ui.sort;
    rows.sort((a, b) => key === 'symbol'
      ? String(a.h.symbol).localeCompare(String(b.h.symbol))
      : (b.m[key] || 0) - (a.m[key] || 0));
    return rows;
  }

  function renderHoldings() {
    const total = Calc.portfolioTotals(state.holdings).value;
    const rows = filteredHoldings();
    const body = $('#holdingsBody');
    $('#emptyState').hidden = state.holdings.length > 0;
    $('#holdingsTable').hidden = state.holdings.length === 0;
    $('.toolbar').hidden = state.holdings.length === 0;

    if (state.holdings.length && !rows.length) {
      body.innerHTML = `<tr class="no-match"><td colspan="9">No holdings match your filters.</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(({ h, m }) => {
      const t = TYPES[h.type] || TYPES.other;
      const weight = total > 0 ? (m.value / total) * 100 : 0;
      const live = h.priceSource !== 'manual' && Prices.LIVE_TYPES.has(h.type);
      const fixed = isFixedAsnb(h.type, h.symbol);
      const priceTag = live ? '' : fixed
        ? '<span class="tag" title="Fixed price fund (RM1.00)">F</span>'
        : '<span class="tag" title="Manually priced">M</span>';
      return `<tr data-id="${esc(h.id)}">
        <td class="asset" data-label="Asset"><div class="asset-in">
          <span class="badge" style="--c:${t.color}">${esc(t.label)}</span>
          <div class="asset-main">
            <strong>${esc(h.symbol)}</strong>
            <span class="muted">${esc(h.name || '')}</span>
          </div>
        </div></td>
        <td class="num" data-label="Quantity">${qtyFmt(+h.quantity || 0)}</td>
        <td class="num" data-label="Avg cost">${money(+h.avgCost || 0, { price: true })}</td>
        <td class="num" data-label="Price">${money(+h.price || 0, { price: true })}${priceTag}</td>
        <td class="num ${tone(m.dayChange)}" data-label="Today">${h.prevClose ? pct(m.dayPct) : '<span class="muted">—</span>'}</td>
        <td class="num strong" data-label="Value">${money(m.value)}</td>
        <td class="num ${tone(m.gain)}" data-label="Gain / loss">${signed(m.gain, money)}<small>${pct(m.gainPct)}</small>${m.dividends > 0 ? `<small class="div">incl. div ${money(m.dividends)}</small>` : ''}</td>
        <td class="num" data-label="Weight"><span class="weight"><span style="width:${Math.min(weight, 100).toFixed(1)}%;background:${t.color}"></span></span>${weight.toFixed(1)}%</td>
        <td class="actions">
          <button class="btn sm" data-act="trade">Buy / Sell</button>
          <button class="btn sm" data-act="dividend">Dividend</button>
          <button class="btn sm ghost" data-act="edit" aria-label="Edit ${esc(h.symbol)}">Edit</button>
        </td>
      </tr>`;
    }).join('');
  }

  function renderLastUpdated() {
    const times = state.holdings.map((h) => h.updatedAt || 0).filter(Boolean);
    const n = $('#lastUpdated');
    if (!times.length) { n.textContent = ''; return; }
    const d = new Date(Math.max(...times));
    n.textContent = `Prices ${d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}`;
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, kind = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = `toast ${kind}`;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  // ---------- prices ----------
  async function refreshPrices(silent) {
    if (refreshing || !state.holdings.length) return;
    refreshing = true;
    $('#refreshBtn').classList.add('spinning');
    try {
      const r = await Prices.refreshAll(state.holdings, state.settings);
      persist();
      render();
      if (!silent) {
        if (r.failed.length) toast(`Updated ${r.updated}. Couldn't fetch: ${r.failed.join(', ')}`, 'warn');
        else if (r.notes.length) toast(r.notes[0], 'warn');
        else if (r.updated) toast(`Updated ${r.updated} price${r.updated === 1 ? '' : 's'}`);
        else toast('No live-priced holdings to update');
      }
    } catch (e) {
      if (!silent) toast('Price refresh failed — check your connection.', 'warn');
    } finally {
      refreshing = false;
      $('#refreshBtn').classList.remove('spinning');
    }
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    const mins = +state.settings.autoRefresh;
    if (mins > 0) refreshTimer = setInterval(() => refreshPrices(true), mins * 60000);
  }

  // ---------- holding dialog ----------
  const hDialog = $('#holdingDialog');
  const hForm = $('#holdingForm');

  function openHolding(h) {
    hForm.reset();
    $('#formError').textContent = '';
    $('#holdingDialogTitle').textContent = h ? `Edit ${h.symbol}` : 'Add holding';
    $('#deleteBtn').hidden = !h;
    const f = hForm.elements;
    f.id.value = h ? h.id : '';
    f.type.value = h ? h.type : 'stock';
    f.symbol.value = h ? h.symbol : '';
    f.name.value = h ? h.name || '' : '';
    f.quantity.value = h ? h.quantity : '';
    f.avgCost.value = h ? +(+h.avgCost || 0).toFixed(6) : '';
    f.price.value = h && h.price ? h.price : '';
    f.priceSource.value = h ? h.priceSource || 'auto' : 'auto';
    f.notes.value = h ? h.notes || '' : '';
    renderDivHistory(h);
    updateSourceHint();
    hDialog.showModal();
    setTimeout(() => (h ? f.quantity : f.symbol).focus(), 30);
  }

  function isFixedAsnb(type, symbol) {
    if (type !== 'asnb') return false;
    const fund = ASNB.find(symbol);
    return !!(fund && fund.fixed);
  }

  function renderDivHistory(h) {
    const box = $('#divHistory');
    const list = h && Array.isArray(h.dividends) ? h.dividends : [];
    box.hidden = !list.length;
    if (!list.length) { box.innerHTML = ''; return; }
    const total = list.reduce((a, d) => a + (+d.amount || 0), 0);
    box.innerHTML = `<h3><span>Dividend history</span><span>${money(total)}</span></h3><ul>` +
      list.slice().reverse().map((d) => `<li><span>${esc(d.d ? shortDate(d.d) : '')}${d.rate ? ` · ${d.rate} sen` : ''}</span>` +
        `<span><b>${money(+d.amount || 0)}</b> ${d.reinvested ? `→ ${qtyFmt(d.units || 0)} units` : 'cash'}</span></li>`).join('') + '</ul>';
  }

  function updateSourceHint() {
    const f = hForm.elements;
    const isAsnb = f.type.value === 'asnb';
    if (isAsnb) f.symbol.setAttribute('list', 'asnbFunds'); else f.symbol.removeAttribute('list');
    f.symbol.placeholder = isAsnb ? 'e.g. ASB, ASM, ASNE5' : 'e.g. AAPL, BTC';
    const fund = isAsnb ? ASNB.find(f.symbol.value) : null;
    const fixed = !!(fund && fund.fixed);
    f.price.disabled = fixed;
    if (fixed) {
      f.price.value = ASNB.FIXED_PRICE;
      if (!f.avgCost.value) f.avgCost.value = ASNB.FIXED_PRICE;
    }
    if (fund && (!f.name.value || ASNB.FUNDS.some((x) => x.name === f.name.value))) f.name.value = fund.name;
    const liveCapable = Prices.LIVE_TYPES.has(f.type.value);
    f.priceSource.disabled = !liveCapable;
    if (!liveCapable) f.priceSource.value = 'manual';
    const manual = f.priceSource.value === 'manual';
    f.price.placeholder = manual ? 'Required' : 'Fetched if live';
    let hint = '';
    if (fixed) hint = `${fund.name} is a fixed-price fund at RM1.00 per unit. Your return comes from the yearly distribution: record it with the "Dividend" button.`;
    else if (isAsnb) hint = 'Variable-price fund: enter the latest NAV from the myASNB app or asnb.com.my. Record distributions with the "Dividend" button.';
    else if (!liveCapable) hint = 'This asset type is priced manually — update the price whenever you like.';
    if (isAsnb && state.settings.currency !== 'MYR') hint += ' ASNB prices are in RM; set the display currency to MYR in Settings.';
    else if (f.type.value === 'crypto' && !manual) hint = 'Live price from CoinGecko using the symbol (e.g. BTC, ETH, SOL).';
    else if (!manual) hint = state.settings.finnhubKey
      ? 'Live price from Finnhub. Use the exchange ticker, e.g. AAPL, or with a suffix for non‑US markets (e.g. 1155.KL may require a paid plan).'
      : 'Tip: add a free Finnhub API key in Settings for live stock prices. Until then, enter the price manually.';
    $('#sourceHint').textContent = hint;
  }

  async function saveHolding(e) {
    e.preventDefault();
    const f = hForm.elements;
    const err = $('#formError');
    const symbol = f.symbol.value.trim().toUpperCase();
    const quantity = parseFloat(f.quantity.value);
    const avgCost = parseFloat(f.avgCost.value);
    const fixedFund = isFixedAsnb(f.type.value, f.symbol.value);
    let price = fixedFund ? ASNB.FIXED_PRICE : parseFloat(f.price.value);
    const manual = f.priceSource.value === 'manual' || !Prices.LIVE_TYPES.has(f.type.value);

    if (!symbol) return (err.textContent = 'Enter a symbol or short name.');
    if (!(quantity >= 0)) return (err.textContent = 'Enter a valid quantity.');
    if (!(avgCost >= 0)) return (err.textContent = 'Enter a valid average cost.');
    if (manual && !(price >= 0)) return (err.textContent = 'Enter the current price for a manually priced holding.');

    const existing = state.holdings.find((h) => h.id === f.id.value);
    const h = existing || { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())) };
    const symbolChanged = existing && (existing.symbol !== symbol || existing.type !== f.type.value);
    Object.assign(h, {
      type: f.type.value, symbol, name: f.name.value.trim(), quantity, avgCost,
      priceSource: manual ? 'manual' : 'auto', notes: f.notes.value.trim(),
    });
    if (symbolChanged) { h.coinId = ''; h.prevClose = 0; }
    if (price >= 0 && !Number.isNaN(price)) {
      if (price !== h.price) { h.price = price; h.updatedAt = Date.now(); }
    } else if (!h.price) {
      h.price = avgCost; // placeholder until the live price arrives
    }
    if (!existing) state.holdings.push(h);

    hDialog.close();
    persist();
    render();
    toast(existing ? `${symbol} updated` : `${symbol} added`);
    if (!manual) {
      // fetch the live price for just this holding
      Prices.refreshAll([h], state.settings).then((r) => {
        persist(); render();
        if (r.failed.length) toast(`Couldn't fetch a live price for ${symbol}. Using the price you entered.`, 'warn');
      }).catch(() => {});
    }
  }

  function deleteHolding() {
    const id = hForm.elements.id.value;
    const h = state.holdings.find((x) => x.id === id);
    if (!h || !confirm(`Delete ${h.symbol}? This can't be undone.`)) return;
    state.holdings = state.holdings.filter((x) => x.id !== id);
    hDialog.close();
    persist();
    render();
    toast(`${h.symbol} deleted`);
  }

  // ---------- dividend dialog ----------
  const dDialog = $('#divDialog');
  const dForm = $('#divForm');
  let divId = null;

  function openDividend(h) {
    divId = h.id;
    dForm.reset();
    $('#divError').textContent = '';
    $('#divTitle').textContent = `${h.symbol} — Record dividend`;
    $('#divUnits').textContent = `You hold ${qtyFmt(+h.quantity || 0)} units.`;
    const f = dForm.elements;
    f.date.value = Calc.isoDate(new Date());
    f.reinvest.checked = h.type === 'asnb';
    f.unitPrice.value = h.price || '';
    f.unitPrice.disabled = isFixedAsnb(h.type, h.symbol);
    $('#divPriceWrap').hidden = !f.reinvest.checked;
    dDialog.showModal();
    setTimeout(() => f.rate.focus(), 30);
  }

  function saveDividend(e) {
    e.preventDefault();
    const h = state.holdings.find((x) => x.id === divId);
    const f = dForm.elements;
    const err = $('#divError');
    if (!h) return dDialog.close();
    const amount = parseFloat(f.amount.value);
    const unitPrice = parseFloat(f.unitPrice.value);
    if (!f.date.value) return (err.textContent = 'Choose the payment date.');
    if (!(amount > 0)) return (err.textContent = 'Enter the amount received.');
    if (f.reinvest.checked && !(unitPrice > 0)) return (err.textContent = 'Enter the price the units were bought at.');
    Calc.recordDividend(h, {
      amount, date: f.date.value, reinvest: f.reinvest.checked, unitPrice, rate: parseFloat(f.rate.value) || 0,
    });
    dDialog.close();
    persist();
    render();
    toast(`Recorded ${money(amount)} dividend for ${h.symbol}`);
  }

  // ---------- trade dialog ----------
  const tDialog = $('#tradeDialog');
  const tForm = $('#tradeForm');

  function openTrade(h) {
    ui.tradeId = h.id;
    tForm.reset();
    $('#tradeError').textContent = '';
    $('#tradeTitle').textContent = `${h.symbol} — Buy / Sell`;
    tForm.elements.price.value = h.price || '';
    setSide('buy');
    tDialog.showModal();
    setTimeout(() => tForm.elements.qty.focus(), 30);
  }

  function setSide(side) {
    ui.tradeSide = side;
    $$('#tradeSide button').forEach((b) => b.classList.toggle('active', b.dataset.side === side));
    const h = state.holdings.find((x) => x.id === ui.tradeId);
    if (!h) return;
    $('#tradeHint').textContent = side === 'buy'
      ? `Your average cost will be recalculated. Currently ${qtyFmt(+h.quantity)} @ ${money(+h.avgCost, { price: true })}.`
      : `You hold ${qtyFmt(+h.quantity)}. Realised gain/loss is shown after the sale.`;
  }

  function saveTrade(e) {
    e.preventDefault();
    const h = state.holdings.find((x) => x.id === ui.tradeId);
    const qty = parseFloat(tForm.elements.qty.value);
    const price = parseFloat(tForm.elements.price.value);
    const err = $('#tradeError');
    if (!h) return tDialog.close();
    if (!(qty > 0)) return (err.textContent = 'Enter a quantity greater than zero.');
    if (!(price >= 0)) return (err.textContent = 'Enter a valid price.');

    if (ui.tradeSide === 'buy') {
      Object.assign(h, Calc.mergeBuy(h.quantity, h.avgCost, qty, price));
      toast(`Bought ${qtyFmt(qty)} ${h.symbol}`);
    } else {
      if (qty > +h.quantity + 1e-12) return (err.textContent = `You only hold ${qtyFmt(+h.quantity)}.`);
      const realised = qty * (price - +h.avgCost);
      h.quantity = Math.max(0, +h.quantity - qty);
      if (h.quantity < 1e-12) {
        state.holdings = state.holdings.filter((x) => x.id !== h.id);
      }
      toast(`Sold ${qtyFmt(qty)} ${h.symbol} · realised ${signed(realised, money)}`, realised < 0 ? 'warn' : '');
    }
    tDialog.close();
    persist();
    render();
  }

  // ---------- settings ----------
  const sDialog = $('#settingsDialog');
  const sForm = $('#settingsForm');

  function openSettings() {
    const f = sForm.elements;
    f.currency.value = state.settings.currency;
    f.autoRefresh.value = String(state.settings.autoRefresh || 0);
    f.finnhubKey.value = state.settings.finnhubKey || '';
    sDialog.showModal();
  }

  function saveSettings(e) {
    e.preventDefault();
    const f = sForm.elements;
    const currencyChanged = f.currency.value !== state.settings.currency;
    const keyAdded = f.finnhubKey.value.trim() && !state.settings.finnhubKey;
    state.settings.currency = f.currency.value;
    state.settings.autoRefresh = +f.autoRefresh.value;
    state.settings.finnhubKey = f.finnhubKey.value.trim();
    Storage.save(state);
    sDialog.close();
    scheduleRefresh();
    render();
    toast('Settings saved');
    if (currencyChanged || keyAdded) refreshPrices(true);
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.holdings)) throw new Error('bad file');
        if (!confirm(`Replace your current portfolio with ${data.holdings.length} holdings from this backup?`)) return;
        state = {
          holdings: data.holdings,
          history: Array.isArray(data.history) ? data.history : [],
          settings: Object.assign(Storage.defaults().settings, data.settings || {}),
        };
        Storage.save(state);
        sDialog.close();
        applyTheme();
        scheduleRefresh();
        render();
        toast('Backup imported');
      } catch (e) {
        toast('That file is not a valid portfolio backup.', 'warn');
      }
    };
    reader.readAsText(file);
  }

  // ---------- demo data ----------
  function loadDemo() {
    if (state.holdings.length && !confirm('Replace your current portfolio with sample data?')) return;
    const mk = (type, symbol, name, quantity, avgCost, price, prevClose, priceSource = 'auto') =>
      ({ id: crypto.randomUUID ? crypto.randomUUID() : symbol + Date.now(), type, symbol, name, quantity, avgCost,
        price, prevClose, priceSource, notes: 'Sample', updatedAt: 0 });
    state.holdings = [
      mk('stock', 'AAPL', 'Apple Inc.', 25, 150.2, 228.5, 226.1),
      mk('stock', 'MSFT', 'Microsoft Corp.', 12, 310, 415.3, 418.9),
      mk('stock', 'NVDA', 'NVIDIA Corp.', 40, 45.5, 135.2, 131.0),
      mk('etf', 'VOO', 'Vanguard S&P 500 ETF', 10, 380, 525.4, 522.0),
      mk('crypto', 'BTC', 'Bitcoin', 0.15, 38000, 68000, 67100),
      mk('crypto', 'ETH', 'Ethereum', 2.5, 2100, 2650, 2700),
      mk('commodity', 'GOLD', 'Physical gold (oz)', 3, 1900, 2400, 0, 'manual'),
      mk('cash', 'CASH', 'High-yield savings', 1, 8000, 8000, 0, 'manual'),
    ];
    // synthetic 1-year history so the chart has something to show
    const totals = Calc.portfolioTotals(state.holdings);
    const days = 365;
    const hist = [];
    let v = totals.cost * 0.98;
    const today = new Date();
    for (let i = days; i >= 1; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const progress = 1 - i / days;
      const target = totals.cost + (totals.value - totals.cost) * progress;
      v = v + (target - v) * 0.08 + v * (Math.random() - 0.5) * 0.022;
      hist.push({ d: Calc.isoDate(d), v: Math.round(v * 100) / 100, c: Math.round(totals.cost * 100) / 100 });
    }
    state.history = hist;
    persist();
    sDialog.open && sDialog.close();
    render();
    toast('Sample portfolio loaded — tap refresh for live crypto prices');
  }

  // ---------- theme ----------
  function effectiveTheme() {
    const t = state.settings.theme;
    if (t === 'light' || t === 'dark') return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    $('meta[name="theme-color"]').setAttribute('content', effectiveTheme() === 'dark' ? '#0b1120' : '#f6f7fb');
  }

  // ---------- wiring ----------
  function init() {
    const typeOpts = Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    hForm.elements.type.innerHTML = typeOpts;
    $('#typeFilter').insertAdjacentHTML('beforeend', typeOpts);

    applyTheme();
    $('#themeBtn').addEventListener('click', () => {
      state.settings.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
      Storage.save(state);
      applyTheme();
      render();
    });

    $('#refreshBtn').addEventListener('click', () => refreshPrices(false));
    $('#settingsBtn').addEventListener('click', openSettings);
    $('#addBtn').addEventListener('click', () => openHolding(null));
    $('#emptyAdd').addEventListener('click', () => openHolding(null));
    $('#emptyDemo').addEventListener('click', loadDemo);
    $('#loadDemo').addEventListener('click', loadDemo);

    $$('dialog').forEach((d) => {
      $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => d.close()));
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // backdrop click
    });

    hForm.addEventListener('submit', saveHolding);
    hForm.elements.type.addEventListener('change', updateSourceHint);
    hForm.elements.priceSource.addEventListener('change', updateSourceHint);
    $('#deleteBtn').addEventListener('click', deleteHolding);

    tForm.addEventListener('submit', saveTrade);
    dForm.addEventListener('submit', saveDividend);
    dForm.elements.reinvest.addEventListener('change', (e) => { $('#divPriceWrap').hidden = !e.target.checked; });
    dForm.elements.rate.addEventListener('input', (e) => {
      const h = state.holdings.find((x) => x.id === divId);
      const rate = parseFloat(e.target.value);
      if (h && rate > 0) dForm.elements.amount.value = ((+h.quantity || 0) * rate / 100).toFixed(2);
    });
    $('#asnbFunds').innerHTML = ASNB.FUNDS.map((x) =>
      `<option value="${x.code}">${esc(x.name)}${x.fixed ? ' (fixed RM1.00)' : ''}</option>`).join('');
    hForm.elements.symbol.addEventListener('input', updateSourceHint);
    $$('#tradeSide button').forEach((b) => b.addEventListener('click', () => setSide(b.dataset.side)));

    sForm.addEventListener('submit', saveSettings);
    $('#exportJson').addEventListener('click', () =>
      download(`portfolio-backup-${Calc.isoDate(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json'));
    $('#exportCsv').addEventListener('click', () =>
      download(`portfolio-${Calc.isoDate(new Date())}.csv`, Calc.toCSV(state.holdings), 'text/csv'));
    $('#importJson').addEventListener('change', (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
    $('#clearAll').addEventListener('click', () => {
      if (!confirm('Delete all holdings, history and settings from this browser?')) return;
      Storage.clear();
      state = Storage.defaults();
      sDialog.close();
      applyTheme();
      scheduleRefresh();
      render();
      toast('All data deleted');
    });

    $('#holdingsBody').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      const row = e.target.closest('tr[data-id]');
      if (!row) return;
      const h = state.holdings.find((x) => x.id === row.dataset.id);
      if (!h) return;
      if (btn && btn.dataset.act === 'trade') openTrade(h);
      else if (btn && btn.dataset.act === 'dividend') openDividend(h);
      else openHolding(h);
    });

    $('#search').addEventListener('input', (e) => { ui.search = e.target.value; renderHoldings(); });
    $('#typeFilter').addEventListener('change', (e) => { ui.type = e.target.value; renderHoldings(); });
    $('#sortBy').addEventListener('change', (e) => { ui.sort = e.target.value; renderHoldings(); });

    $$('#rangeSeg button').forEach((b) => b.addEventListener('click', () => {
      ui.range = b.dataset.range;
      $$('#rangeSeg button').forEach((x) => x.classList.toggle('active', x === b));
      renderPerformance();
    }));
    $$('#allocSeg button').forEach((b) => b.addEventListener('click', () => {
      ui.allocBy = b.dataset.by;
      $$('#allocSeg button').forEach((x) => x.classList.toggle('active', x === b));
      renderAllocation();
    }));

    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderPerformance, 120); });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && +state.settings.autoRefresh > 0) refreshPrices(true);
    });

    persist();
    render();
    scheduleRefresh();
    if (state.holdings.length) refreshPrices(true);
  }

  init();
})();
