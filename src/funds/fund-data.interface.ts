import { ReturnSource } from '../soi/soi.types';

/** Instrument classification derived from Yahoo's quoteType. */
export type InstrumentType = 'ETF' | 'MUTUALFUND' | 'EQUITY' | 'INDEX' | 'OTHER';

/**
 * Fully-resolved data for one instrument, ready to feed the SOI engine and to
 * render in the UI. All percentages are PERCENT (not decimals).
 */
export interface FundData {
  symbol: string;
  name: string;
  type: InstrumentType;

  /** Net expense ratio (%). 0 for individual stocks; null if a fund hides it. */
  expenseRatio: number | null;

  /** The long-term return (%) the SOI engine will use as `r`. */
  longTermReturn: number | null;
  /** Window the return represents, e.g. "10Y", "6.4Y", or "proxy". */
  returnWindow: string | null;
  /** Where `longTermReturn` came from. */
  returnSource: ReturnSource | null;

  /** 5-year beta (volatility vs market). null → engine assumes 1.0. */
  beta: number | null;

  // ── Display-only context (never feeds the SOI score) ──────────────────────
  oneYearReturn: number | null;
  threeYearReturn: number | null;
  fiveYearReturn: number | null;
  tenYearReturn: number | null;
  currentPrice: number | null;
  todayChangePercent: number | null;
  category: string | null;

  // ── Provenance flags ──────────────────────────────────────────────────────
  proxyUsed: boolean;
  proxyNote?: string;
  /** True when the return was computed from price history (not Yahoo trailing). */
  computedReturn: boolean;
  dataSource: string;
  fetchedAt: string;
}

export interface FundFetchError {
  symbol: string;
  message: string;
}
