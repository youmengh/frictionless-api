import { allocateBySOI, betaPenalty, scoreSOI } from './soi-engine';
import { SoiInput } from './soi.types';

/**
 * Reference universe from spec §8. Betas omitted here so they default to 1.0,
 * which makes SOI collapse to the original `10r − 100x` — this is the documented
 * regression anchor that must keep passing after the v2 (beta) formula change.
 */
const referenceUniverse: SoiInput[] = [
  { symbol: 'FSELX', expenseRatio: 0.6, longTermReturn: 31.09 },
  { symbol: 'QQQM', expenseRatio: 0.15, longTermReturn: 19.0 },
  { symbol: 'VTI', expenseRatio: 0.03, longTermReturn: 15.11 },
  { symbol: 'SCHB', expenseRatio: 0.03, longTermReturn: 14.7 },
  { symbol: 'FXAIX', expenseRatio: 0.015, longTermReturn: 14.15 },
  { symbol: 'FELG', expenseRatio: 0.18, longTermReturn: 15.86 },
  { symbol: 'VOO', expenseRatio: 0.03, longTermReturn: 14.16 },
  { symbol: 'FSKAX', expenseRatio: 0.015, longTermReturn: 13.23 },
  { symbol: 'FNILX', expenseRatio: 0.0, longTermReturn: 13.1 },
  { symbol: 'FDSVX', expenseRatio: 0.62, longTermReturn: 17.28 },
];

describe('SOI engine — v2 formula (10r − 100x − 20·max(0, β−1))', () => {
  describe('regression: spec §8 reference output (all β = 1.0)', () => {
    // NOTE: spec §8 contains two arithmetic errors in its published table —
    // FXAIX (spec says soi 141.35, correct 140.00) and FSKAX (spec says 131.75,
    // correct 130.80). Both funds have a 0.015% expense ratio whose fee penalty
    // was mis-applied in the spec. The corrected totalSOI is 1509.80 (not 1512.10).
    // These tests assert the mathematically correct values; see README.
    const result = allocateBySOI(referenceUniverse, 7000, {
      maxExpenseRatio: 1.0,
      minLongTermReturn: 12.0,
    });

    it('rejects nothing — all 10 funds pass', () => {
      expect(result.rejected).toEqual([]);
      expect(result.allocations).toHaveLength(10);
    });

    it('totalSOI is the corrected reference value (1509.80)', () => {
      expect(result.totalSOI).toBe(1509.8);
    });

    it.each([
      ['FSELX', 250.9],
      ['QQQM', 175.0],
      ['VTI', 148.1],
      ['SCHB', 144.0],
      ['FELG', 140.6],
      ['FXAIX', 140.0], // spec §8 erroneously says 141.35
      ['VOO', 138.6],
      ['FNILX', 131.0],
      ['FSKAX', 130.8], // spec §8 erroneously says 131.75
      ['FDSVX', 110.8],
    ])('%s scores soi %p', (symbol, soi) => {
      const a = result.allocations.find((x) => x.symbol === symbol)!;
      expect(a.soi).toBe(soi);
    });

    it('FSELX weight/dollars derive from its SOI share', () => {
      const fselx = result.allocations.find((a) => a.symbol === 'FSELX')!;
      expect(fselx.percent).toBeCloseTo(16.62, 1); // 250.90 / 1509.80
      expect(fselx.dollars).toBeCloseTo(1163.27, 1);
    });

    it('allocations are sorted by SOI descending', () => {
      const scores = result.allocations.map((a) => a.soi);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    });

    it('percent weights sum to ~100 and dollars sum to ~capital', () => {
      const pct = result.allocations.reduce((s, a) => s + a.percent, 0);
      const usd = result.allocations.reduce((s, a) => s + a.dollars, 0);
      expect(pct).toBeCloseTo(100, 0);
      expect(usd).toBeCloseTo(7000, 0);
    });
  });

  describe('threshold sensitivity', () => {
    it('minLongTermReturn 15.00% rejects the five funds below it', () => {
      const { rejected } = allocateBySOI(referenceUniverse, 7000, {
        minLongTermReturn: 15.0,
      });
      const rejectedSymbols = rejected.map((r) => r.symbol).sort();
      expect(rejectedSymbols).toEqual(['FNILX', 'FSKAX', 'FXAIX', 'SCHB', 'VOO']);
    });

    it('minLongTermReturn 10.00% passes all 10', () => {
      const { rejected } = allocateBySOI(referenceUniverse, 7000, {
        minLongTermReturn: 10.0,
      });
      expect(rejected).toEqual([]);
    });

    it('maxExpenseRatio 0.50% rejects FSELX (0.60) and FDSVX (0.62)', () => {
      const { rejected } = allocateBySOI(referenceUniverse, 7000, {
        maxExpenseRatio: 0.5,
      });
      const rejectedSymbols = rejected.map((r) => r.symbol).sort();
      expect(rejectedSymbols).toEqual(['FDSVX', 'FSELX']);
    });

    it('null return is rejected as missing data', () => {
      const universe = [
        { symbol: 'FSELX', expenseRatio: 0.6, longTermReturn: null },
        ...referenceUniverse.slice(1),
      ];
      const { rejected } = allocateBySOI(universe, 7000);
      const fselx = rejected.find((r) => r.symbol === 'FSELX');
      expect(fselx?.reason).toMatch(/missing data/);
    });

    it('null expense ratio is rejected as missing data', () => {
      const universe = [
        { symbol: 'XYZ', expenseRatio: null, longTermReturn: 20 },
        ...referenceUniverse,
      ];
      const { rejected } = allocateBySOI(universe, 7000);
      expect(rejected.find((r) => r.symbol === 'XYZ')?.reason).toMatch(/missing data/);
    });
  });

  describe('beta (excess-risk) penalty', () => {
    it('β ≤ 1 incurs no penalty', () => {
      expect(betaPenalty(1.0)).toBe(0);
      expect(betaPenalty(0.8)).toBe(0);
      expect(betaPenalty(0.0)).toBe(0);
    });

    it('β > 1 is penalized 20 pts per unit of excess beta', () => {
      expect(betaPenalty(1.5)).toBe(10); // 20 * 0.5
      expect(betaPenalty(1.96)).toBe(19.2); // 20 * 0.96
      expect(betaPenalty(2.0)).toBe(20);
    });

    it('scoreSOI trims a high-beta fund vs an identical β=1 fund', () => {
      const base = scoreSOI(31.09, 0.6, 1.0); // 250.9
      const risky = scoreSOI(31.09, 0.6, 1.96); // 250.9 - 19.2
      expect(base).toBe(250.9);
      expect(risky).toBe(231.7);
      expect(risky).toBeLessThan(base);
    });

    it('a concentrated high-beta fund ranks below an equal-return diversified fund', () => {
      const universe: SoiInput[] = [
        { symbol: 'CONCENTRATED', expenseRatio: 0.1, longTermReturn: 20, beta: 1.8 },
        { symbol: 'DIVERSIFIED', expenseRatio: 0.1, longTermReturn: 20, beta: 1.0 },
      ];
      const { allocations } = allocateBySOI(universe, 1000);
      expect(allocations[0].symbol).toBe('DIVERSIFIED');
      expect(allocations[0].soi).toBeGreaterThan(allocations[1].soi);
    });

    it('the custom coefficient is honored', () => {
      const universe: SoiInput[] = [
        { symbol: 'A', expenseRatio: 0.1, longTermReturn: 20, beta: 2.0 },
      ];
      const { allocations } = allocateBySOI(universe, 1000, {
        betaPenaltyCoefficient: 0,
      });
      // coefficient 0 disables the penalty: SOI = 10*20 - 100*0.1 = 190
      expect(allocations[0].soi).toBe(190);
    });
  });

  describe('individual stocks (expense ratio 0)', () => {
    it('scores a stock with no fee penalty', () => {
      const universe: SoiInput[] = [
        { symbol: 'AAPL', expenseRatio: 0, longTermReturn: 25, beta: 1.25 },
      ];
      const { allocations } = allocateBySOI(universe, 1000);
      // 10*25 - 0 - 20*0.25 = 250 - 5 = 245
      expect(allocations[0].soi).toBe(245);
      expect(allocations[0].dollars).toBe(1000);
    });
  });
});
