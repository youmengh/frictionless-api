import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';
import { FundData, InstrumentType } from './fund-data.interface';
import { PROXY_OVERRIDES } from './proxy-overrides';

/** Don't let Yahoo's strict schema validation throw on minor field drift. */
const MODULE_OPTS = { validateResult: false } as const;

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Yahoo throttles aggressively; distinguish that from a genuinely bad ticker. */
function isRateLimited(err: any): boolean {
  const msg = String(err?.message ?? '');
  return (
    msg.includes('Too Many Requests') ||
    msg.includes('429') ||
    err?.response?.status === 429
  );
}

function classify(quoteType?: string): InstrumentType {
  switch (quoteType) {
    case 'ETF':
      return 'ETF';
    case 'MUTUALFUND':
      return 'MUTUALFUND';
    case 'EQUITY':
      return 'EQUITY';
    case 'INDEX':
      return 'INDEX';
    default:
      return 'OTHER';
  }
}

@Injectable()
export class YahooFinanceService {
  private readonly logger = new Logger(YahooFinanceService.name);

  /**
   * Single long-lived client. v3 is class-based: one instance keeps an
   * in-memory cookie jar + crumb and a request queue across calls — exactly
   * what a long-running server wants, and what fixes the spurious 429s older
   * versions hit because their cookie/crumb handshake was out of date.
   * `suppressNotices` / `validation` are now constructor options (not methods).
   */
  private readonly yf = new YahooFinance({
    suppressNotices: ['yahooSurvey', 'ripHistorical'],
    validation: { logErrors: false, logOptionsErrors: false },
    versionCheck: false,
  });

  /**
   * Fetch and fully resolve one instrument. Throws NotFoundException if Yahoo
   * doesn't recognize the symbol (used by the add/validate flow).
   */
  async fetchInstrumentData(rawSymbol: string): Promise<FundData> {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol) {
      throw new NotFoundException('Empty symbol');
    }

    let summary: any;
    try {
      summary = await this.yf.quoteSummary(
        symbol,
        {
          modules: [
            'price',
            'summaryDetail',
            'fundProfile',
            'fundPerformance',
            'defaultKeyStatistics',
            'quoteType',
          ],
        },
        MODULE_OPTS,
      );
    } catch (err: any) {
      this.logger.warn(`quoteSummary failed for ${symbol}: ${err?.message}`);
      if (isRateLimited(err)) {
        throw new ServiceUnavailableException(
          'Yahoo Finance is rate-limiting requests right now — please retry in a moment.',
        );
      }
      throw new NotFoundException(`Symbol "${symbol}" not found`);
    }

    const price = summary?.price ?? {};
    const quoteTypeStr = price.quoteType ?? summary?.quoteType?.quoteType;
    const type = classify(quoteTypeStr);
    const name = price.longName || price.shortName || symbol;

    // A real instrument should at least have a market price. Guard against
    // empty shells that quoteSummary occasionally returns.
    if (price.regularMarketPrice == null && type === 'OTHER') {
      throw new NotFoundException(`Symbol "${symbol}" not found`);
    }

    const isFund = type === 'ETF' || type === 'MUTUALFUND';

    // ── Expense ratio (stocks have none → 0; funds normalize decimal → %) ────
    let expenseRatio: number | null;
    if (isFund) {
      const rawER =
        summary?.fundProfile?.feesExpensesInvestment?.annualReportExpenseRatio ??
        summary?.defaultKeyStatistics?.annualReportExpenseRatio ??
        null;
      expenseRatio = rawER != null ? round(rawER * 100, 4) : null;
    } else {
      expenseRatio = 0; // individual stock / index — no fund management fee
    }

    // ── Trailing returns (display + fund 10-yr source) ───────────────────────
    const tr = summary?.fundPerformance?.trailingReturns ?? {};
    const pct = (v: any): number | null => (v != null ? round(v * 100, 2) : null);
    const oneYearReturn = pct(tr.oneYear);
    const threeYearReturn = pct(tr.threeYear);
    const fiveYearReturn = pct(tr.fiveYear);
    const tenYearReturn = pct(tr.tenYear);

    const betaRaw =
      summary?.defaultKeyStatistics?.beta ?? summary?.summaryDetail?.beta ?? null;
    const beta = betaRaw != null ? round(betaRaw, 3) : null;

    // ── Resolve the long-term return used by the SOI engine ──────────────────
    // Precedence: manual proxy override → Yahoo 10-yr trailing → computed from
    // price history (longest window up to 10y) → null.
    let longTermReturn: number | null = null;
    let returnWindow: string | null = null;
    let returnSource: FundData['returnSource'] = null;
    let proxyUsed = false;
    let proxyNote: string | undefined;
    let computedReturn = false;

    const override = PROXY_OVERRIDES[symbol];
    if (override) {
      longTermReturn = override.longTermReturn;
      returnWindow = 'proxy';
      returnSource = 'proxy';
      proxyUsed = true;
      proxyNote = override.note;
    } else if (tenYearReturn != null) {
      longTermReturn = tenYearReturn;
      returnWindow = '10Y';
      returnSource = 'trailing';
    } else {
      const computed = await this.computeAnnualizedReturn(symbol);
      if (computed) {
        longTermReturn = computed.value;
        returnWindow = `${computed.years}Y`;
        returnSource = 'computed';
        computedReturn = true;
      }
    }

    return {
      symbol,
      name,
      type,
      expenseRatio,
      longTermReturn,
      returnWindow,
      returnSource,
      beta,
      oneYearReturn,
      threeYearReturn,
      fiveYearReturn,
      tenYearReturn,
      currentPrice: price.regularMarketPrice ?? null,
      todayChangePercent:
        price.regularMarketChangePercent != null
          ? round(price.regularMarketChangePercent * 100, 2)
          : null,
      category: summary?.fundProfile?.categoryName ?? null,
      proxyUsed,
      proxyNote,
      computedReturn,
      dataSource: 'yahoo-finance2',
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Annualized total return (CAGR) from adjusted-close price history over the
   * longest available window up to 10 years. Works for stocks, ETFs, and funds.
   * Returns null if there isn't at least ~1 year of usable history.
   */
  private async computeAnnualizedReturn(
    symbol: string,
  ): Promise<{ value: number; years: number } | null> {
    const period2 = new Date();
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 10);

    let chart: any;
    try {
      chart = await this.yf.chart(
        symbol,
        { period1, period2, interval: '1mo' },
        MODULE_OPTS,
      );
    } catch (err: any) {
      this.logger.warn(`chart failed for ${symbol}: ${err?.message}`);
      return null;
    }

    const quotes = (chart?.quotes ?? []).filter(
      (q: any) => q?.adjclose != null && q.adjclose > 0 && q?.date != null,
    );
    if (quotes.length < 13) return null; // need roughly a year of monthly points

    const first = quotes[0];
    const last = quotes[quotes.length - 1];
    const years =
      (new Date(last.date).getTime() - new Date(first.date).getTime()) /
      (365.25 * 24 * 3600 * 1000);
    if (years < 0.9) return null;

    const cagr = Math.pow(last.adjclose / first.adjclose, 1 / years) - 1;
    if (!Number.isFinite(cagr)) return null;

    return { value: round(cagr * 100, 2), years: round(years, 1) };
  }
}
