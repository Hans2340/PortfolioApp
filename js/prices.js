/* Live price providers.
 *  - Crypto: CoinGecko public API (no key required).
 *  - Stocks / ETFs / funds: Finnhub (free API key, set in Settings).
 *  Anything else (bonds, cash, property...) uses the manually entered price.
 */
(function (root) {
  'use strict';

  const COMMON_COINS = {
    BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether', USDC: 'usd-coin', BNB: 'binancecoin',
    SOL: 'solana', XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', TRX: 'tron',
    DOT: 'polkadot', MATIC: 'matic-network', POL: 'polygon-ecosystem-token', LTC: 'litecoin',
    AVAX: 'avalanche-2', LINK: 'chainlink', ATOM: 'cosmos', XLM: 'stellar', TON: 'the-open-network',
    SHIB: 'shiba-inu', BCH: 'bitcoin-cash', NEAR: 'near', UNI: 'uniswap', APT: 'aptos',
    ARB: 'arbitrum', OP: 'optimism', SUI: 'sui', PEPE: 'pepe', XMR: 'monero', ETC: 'ethereum-classic',
  };

  const LIVE_TYPES = new Set(['stock', 'etf', 'fund', 'crypto']);

  async function getJSON(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function resolveCoinId(symbol) {
    const s = String(symbol || '').trim().toUpperCase();
    if (!s) return '';
    if (COMMON_COINS[s]) return COMMON_COINS[s];
    const data = await getJSON(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(s)}`);
    const exact = (data.coins || []).find((c) => String(c.symbol).toUpperCase() === s);
    return exact ? exact.id : (data.coins && data.coins[0] ? data.coins[0].id : '');
  }

  async function fetchCrypto(coinIds, currency) {
    const cur = currency.toLowerCase();
    const ids = [...new Set(coinIds.filter(Boolean))];
    if (!ids.length) return {};
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.map(encodeURIComponent).join(',')}` +
      `&vs_currencies=${cur}&include_24hr_change=true`;
    const data = await getJSON(url);
    const out = {};
    for (const id of ids) {
      const row = data[id];
      if (!row || row[cur] == null) continue;
      const price = row[cur];
      const chg = row[`${cur}_24h_change`];
      out[id] = { price, prevClose: Number.isFinite(chg) ? price / (1 + chg / 100) : 0 };
    }
    return out;
  }

  async function fetchStock(symbol, key) {
    const data = await getJSON(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`);
    if (!data || !data.c) throw new Error(`No quote for ${symbol}`);
    return { price: data.c, prevClose: data.pc || 0 };
  }

  /**
   * Refresh prices for all auto-priced holdings. Mutates holdings in place.
   * Returns { updated, failed: [symbols], skipped: reason|null }.
   */
  async function refreshAll(holdings, settings) {
    let updated = 0;
    const failed = [];
    const notes = [];
    const auto = holdings.filter((h) => h.priceSource !== 'manual' && LIVE_TYPES.has(h.type));

    // Crypto
    const cryptos = auto.filter((h) => h.type === 'crypto');
    for (const h of cryptos) {
      if (!h.coinId) {
        try { h.coinId = await resolveCoinId(h.symbol); } catch (e) { /* handled below */ }
      }
    }
    if (cryptos.length) {
      try {
        const quotes = await fetchCrypto(cryptos.map((h) => h.coinId), settings.currency);
        for (const h of cryptos) {
          const q = quotes[h.coinId];
          if (q) { h.price = q.price; h.prevClose = q.prevClose; h.updatedAt = Date.now(); updated++; }
          else failed.push(h.symbol);
        }
      } catch (e) {
        failed.push(...cryptos.map((h) => h.symbol));
      }
    }

    // Stocks / ETFs / funds
    const stocks = auto.filter((h) => h.type !== 'crypto');
    if (stocks.length && !settings.finnhubKey) {
      notes.push('Add a free Finnhub API key in Settings to auto-update stock prices.');
    } else {
      await Promise.all(stocks.map(async (h) => {
        try {
          const q = await fetchStock(h.symbol, settings.finnhubKey);
          h.price = q.price; h.prevClose = q.prevClose; h.updatedAt = Date.now(); updated++;
        } catch (e) {
          failed.push(h.symbol);
        }
      }));
    }
    return { updated, failed, notes };
  }

  root.Prices = { refreshAll, resolveCoinId, LIVE_TYPES };
})(window);
