/**
 * Shared SOI domain types. All percentage values are expressed as PERCENT
 * (e.g. 31.09 for 31.09%, 0.60 for a 0.60% expense ratio) — never as decimals.
 */

/** How the long-term return figure for a fund was sourced. */
export type ReturnSource = 'trailing' | 'computed' | 'proxy';

/** A single instrument fed into the SOI engine. */
export interface SoiInput {
  symbol: string;
  /** Net annual expense ratio as a percent. 0 for individual stocks. */
  expenseRatio: number | null;
  /** Long-term annualized return as a percent. */
  longTermReturn: number | null;
  /** 5-year beta. Null is treated as 1.0 (market) by the engine. */
  beta?: number | null;
}

/** A scored + allocated instrument. */
export interface SoiAllocation extends SoiInput {
  /** Beta actually used in scoring (1.0 when input beta was null). */
  betaUsed: number;
  /** Whether the engine substituted 1.0 because beta was missing. */
  betaAssumed: boolean;
  /** Excess-risk penalty that was subtracted: 20 * max(0, betaUsed - 1). */
  betaPenalty: number;
  soi: number;
  /** Share of total SOI, as a percent. */
  percent: number;
  /** Dollar allocation. */
  dollars: number;
}

export interface SoiRejection {
  symbol: string;
  reason: string;
}

export interface SoiOptions {
  /** Max allowed expense ratio (percent). Default 1.00. */
  maxExpenseRatio?: number;
  /** Minimum long-term return (percent), exclusive. Default 12.00. */
  minLongTermReturn?: number;
  /** Excess-risk penalty coefficient. Default 20. */
  betaPenaltyCoefficient?: number;
}

export interface SoiResult {
  allocations: SoiAllocation[];
  rejected: SoiRejection[];
  totalSOI: number;
  allocatedCapital: number;
}
