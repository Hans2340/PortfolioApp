# PortfolioApp

A responsive web app for monitoring an investment portfolio: stocks, ETFs, mutual funds, crypto, bonds, gold, property, cash and anything else.

No build step, no server, no dependencies. Open it in a browser and start adding holdings.

## Features

- **Holdings:** add, edit or delete holdings with a type, symbol, quantity, average cost and price.
- **Buy / Sell:** buying more recalculates the weighted average cost. Selling shows the realised gain or loss. A position sold to zero is removed.
- **Live prices**
  - Crypto: [CoinGecko](https://www.coingecko.com/en/api). No key needed; prices are quoted in your display currency.
  - Stocks, ETFs and funds: [Finnhub](https://finnhub.io). Paste a free API key into **Settings**.
  - Anything can be switched to **manual** pricing. Bonds, cash, property and gold are always manual.
  - Refresh on demand, or turn on auto-refresh every 1, 5 or 15 minutes.
- **Dashboard**
  - Total value, today's change, total gain/loss and amount invested.
  - Best and worst performers.
  - Performance chart (1M / 3M / 6M / 1Y / All) comparing market value with amount invested. The period return excludes deposits.
  - Allocation donut, by asset type or by holding.
- **Holdings table:** search, filter by type, and sort by value, gain, gain % or today %. On phones the table turns into cards.
- **Data**
  - Everything is stored in your browser (`localStorage`).
  - Export or import a JSON backup.
  - Export to CSV.
  - Load a sample portfolio.
- **Looks:** light and dark theme. Can be installed to the home screen (web app manifest).

> The performance chart is built from daily snapshots. A snapshot is saved each day the app is opened, so the history grows the more you use it.

## Running it

Any static file server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly also works, because the scripts are classic scripts rather than ES modules.

To host it, publish the repository with GitHub Pages: Settings → Pages → deploy from the branch root.

## Tests

The calculation logic (`js/calc.js`) has unit tests:

```bash
node --test tests/*.test.js
```

## Project layout

```
index.html            page markup and dialogs
css/styles.css        styles, theming, responsive layout
js/calc.js            pure calculations (metrics, totals, allocation, history, CSV)
js/storage.js         localStorage persistence
js/prices.js          CoinGecko / Finnhub price providers
js/charts.js          dependency-free SVG line + donut charts
js/app.js             UI state, rendering and event wiring
tests/calc.test.js    unit tests
```

## Notes

- Finnhub's free plan mainly covers US-listed symbols. For other markets (for example Bursa Malaysia), set the holding to **Manual** pricing.
- Stock quotes are returned in the exchange's own currency. The display-currency setting changes formatting and crypto quotes only, with no FX conversion.
