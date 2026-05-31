import {
  SoiAllocation,
  SoiInput,
  SoiOptions,
  SoiRejection,
  SoiResult,
} from './soi.types';

/**
 * Score of Investibility (SOI) engine — pure logic, no I/O, no framework deps.
 *
 * Pipeline: Screen → Score → Weight → Allocate.
 *
 * SCORE (v2):  SOI = 10·r − 100·x − 20·max(0, β − 1)
 *
 *   r = long-term annualized return (%)
 *   x = net expense ratio (%)         (0 for individual stocks)
 *   β = 5-year beta                   (null → treated as 1.0, no penalty)
 *
 * The third term is a gentle "excess-risk" penalty: a fund is only penalized
 * for the portion of its beta ABOVE market (β > 1). A diversified fund (β ≈ 1)
 * is unaffected; a concentrated, high-volatility fund is trimmed. When β = 1
 * for every fund the formula collapses to the original `10r − 100x`, so the
 * verified reference output (spec §8) remains a valid regression test.
 */

const DEFAULT_MAX_ER = 1.0;
const DEFAULT_MIN_RETURN = 12.0;
const DEFAULT_BETA_COEFF = 20;

/** Round to a fixed number of decimals without floating-point string noise. */
function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Compute the excess-risk penalty for a given beta. */
export function betaPenalty(beta: number, coefficient = DEFAULT_BETA_COEFF): number {
  return round(coefficient * Math.max(0, beta - 1), 2);
}

/** Compute a single fund's raw SOI score. Exported for reuse/testing. */
export function scoreSOI(
  longTermReturn: number,
  expenseRatio: number,
  beta: number,
  coefficient = DEFAULT_BETA_COEFF,
): number {
  const raw = 10 * longTermReturn - 100 * expenseRatio - betaPenalty(beta, coefficient);
  return round(raw, 2);
}

export function allocateBySOI(
  universe: SoiInput[],
  allocatedCapital: number,
  options: SoiOptions = {},
): SoiResult {
  const maxER = options.maxExpenseRatio ?? DEFAULT_MAX_ER;
  const minR = options.minLongTermReturn ?? DEFAULT_MIN_RETURN;
  const coeff = options.betaPenaltyCoefficient ?? DEFAULT_BETA_COEFF;

  const rejected: SoiRejection[] = [];

  // ── Stage 1: Screen ──────────────────────────────────────────────────────
  const screened = universe.filter((f) => {
    if (f.expenseRatio === null || f.longTermReturn === null) {
      rejected.push({
        symbol: f.symbol,
        reason: 'missing data — no long-term return or expense ratio available',
      });
      return false;
    }
    if (f.expenseRatio > maxER) {
      rejected.push({
        symbol: f.symbol,
        reason: `expense ratio ${f.expenseRatio}% > max ${maxER}%`,
      });
      return false;
    }
    if (f.longTermReturn <= minR) {
      rejected.push({
        symbol: f.symbol,
        reason: `long-term return ${f.longTermReturn}% ≤ min ${minR}%`,
      });
      return false;
    }
    return true;
  });

  // ── Stage 2: Score ───────────────────────────────────────────────────────
  const scored = screened.map((f) => {
    const betaUsed = f.beta === null || f.beta === undefined ? 1.0 : f.beta;
    const betaAssumed = f.beta === null || f.beta === undefined;
    const penalty = betaPenalty(betaUsed, coeff);
    const soi = scoreSOI(
      f.longTermReturn as number,
      f.expenseRatio as number,
      betaUsed,
      coeff,
    );
    return { ...f, betaUsed, betaAssumed, betaPenalty: penalty, soi };
  });

  // Defensive: drop non-positive SOI (rare after the screen).
  const positive = scored.filter((f) => {
    if (f.soi <= 0) {
      rejected.push({ symbol: f.symbol, reason: `non-positive SOI: ${f.soi}` });
      return false;
    }
    return true;
  });

  // ── Stage 3: Weight + Stage 4: Allocate ──────────────────────────────────
  const totalSOI = positive.reduce((sum, f) => sum + f.soi, 0);

  const allocations: SoiAllocation[] = positive
    .map((f) => ({
      ...f,
      percent: totalSOI > 0 ? round((f.soi / totalSOI) * 100, 2) : 0,
      dollars: totalSOI > 0 ? round((f.soi / totalSOI) * allocatedCapital, 2) : 0,
    }))
    .sort((a, b) => b.soi - a.soi);

  return {
    allocations,
    rejected,
    totalSOI: round(totalSOI, 2),
    allocatedCapital,
  };
}
