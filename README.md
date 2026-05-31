# Frictionless API — SOI Investment Allocator (backend)

NestJS + TypeScript service that fetches live fund/ETF/stock data from Yahoo
Finance and runs the **Score of Investibility (SOI)** allocation algorithm.

## Quick start

```bash
npm install
npm run dev          # watch mode on http://localhost:3001
# or
npm run build && npm start
```

- API base URL: `http://localhost:3001/api`
- **Swagger UI (interactive “try it out”): `http://localhost:3001/api/docs`**
- Unit tests: `npm test`

Environment variables are optional (sensible defaults are baked in). See
`.env.example`: `PORT` (3001), `CORS_ORIGIN` (http://localhost:5173),
`CACHE_TTL_MINUTES` (60).

## The SOI formula (v2)

```
SCREEN:    x ≤ maxExpenseRatio (default 1.00%)   AND   r > minLongTermReturn (default 12.00%)
SCORE:     SOI = 10·r − 100·x − 20·max(0, β − 1)
WEIGHT:    Pₙ = SOIₙ / Σ(SOI) × 100
ALLOCATE:  $ₙ = Pₙ / 100 × Capital

  r = long-term annualized return (%)
  x = net expense ratio (%)        — 0 for individual stocks
  β = 5-year beta                  — null is treated as 1.0 (no penalty)
```

### What changed from the original spec

| Change | Why |
|---|---|
| **Added beta term** `− 20·max(0, β−1)` | Risk-adjustment. A fund is only penalized for the part of its volatility **above** the market (β > 1). A diversified fund (β ≈ 1) is untouched; a concentrated, high-beta fund is trimmed. So a fund earning 30% via a single hot sector no longer scores identically to a diversified fund earning 30%. **When β = 1 for every holding, the formula collapses to the original `10r − 100x`.** |
| **Individual stocks supported** | A stock has no fund expense ratio, so `x = 0`. Its long-term return is computed from adjusted-close price history (see below). |
| **Return fallback** | Precedence for `r`: **(1)** manual proxy override → **(2)** Yahoo 10-yr trailing return → **(3)** annualized return computed from the longest window of price history available (≤ 10y) → **(4)** none → rejected. This is how newer funds and individual stocks get a usable long-term number. |
| **Renamed** `tenYearReturn` → `longTermReturn`, `minTenYearReturn` → `minLongTermReturn` | The figure is no longer always a 10-year number; the UI shows which window/source was used per instrument. |

### ⚠️ Correction to the spec’s “verified reference output” (§8)

The spec’s §8 table contains two arithmetic errors. With `SOI = 10r − 100x`:

| Symbol | x | r | Spec §8 says | Correct |
|---|---:|---:|---:|---:|
| FXAIX | 0.015 | 14.15 | 141.35 | **140.00** |
| FSKAX | 0.015 | 13.23 | 131.75 | **130.80** |

Both have a 0.015% expense ratio whose `−100x` penalty (−1.5) was mis-applied in
the spec. The correct **totalSOI is 1509.80** (not 1512.10). The unit tests
(`src/soi/soi-engine.spec.ts`) assert the mathematically correct values and keep
the corrected §8 universe as a β = 1 regression anchor.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness check |
| GET | `/api/funds/validate?symbol=FSELX` | Validate + fetch one symbol (used by the UI’s “Add”). 404 if unknown, 503 if Yahoo is rate-limiting. |
| GET | `/api/funds?symbols=FSELX,VTI&refresh=true` | Batch fetch; bad tickers land in `errors`, never block the rest |
| POST | `/api/allocate` | Run the SOI algorithm on supplied funds (pure math; no network) |

`POST /api/allocate` body:

```json
{
  "funds": [
    { "symbol": "FSELX", "expenseRatio": 0.60, "longTermReturn": 31.09, "beta": 1.96 }
  ],
  "allocatedCapital": 7000,
  "options": { "maxExpenseRatio": 1.00, "minLongTermReturn": 12.00, "betaPenaltyCoefficient": 20 }
}
```

## Architecture notes

- **`src/soi/soi-engine.ts`** is pure logic (no I/O, no framework) and is the
  only thing unit-tested. Screen → Score → Weight → Allocate.
- **All Yahoo Finance calls are server-side** (browser can’t call Yahoo due to
  CORS). Results are cached in-memory per symbol (TTL `CACHE_TTL_MINUTES`).
- Yahoo is an **unofficial, no-SLA API**. Every call is wrapped in try/catch and
  degrades gracefully (partial data, never a crash). Per spec guidance there is
  **no retry logic** — a 429 surfaces as a clean 503 (“busy, retry shortly”)
  rather than masquerading as a “symbol not found”.
- `yahoo-finance2` is on **`^3.15.2`** (latest). v3 is **class-based**: we create
  one `new YahooFinance({ … })` in `YahooFinanceService` and reuse it, so the
  in-memory cookie jar + crumb and the request queue are shared across calls.
  `suppressNotices` and `validation` are now **constructor options** (not the v2
  `yahooFinance.suppressNotices(…)` method). v3 is dual CJS/ESM, so it resolves
  cleanly under our CommonJS build — unlike the ESM-only `2.14.x` line.

## Rate-limiting (`503`) — usually a stale-version problem

If `GET /api/funds/validate` returns
`503 "Yahoo Finance is rate-limiting requests right now"`, the usual cause is an
**out-of-date `yahoo-finance2`** whose cookie/crumb handshake no longer matches
Yahoo’s current auth flow — so even your first request of the day looks
unauthenticated and gets a `429`. Upgrading to the latest version (done) fixes
it. A genuine `429` can still happen under heavy bursts; there is intentionally
**no retry** (per spec) — wait a moment and retry.
