import { Injectable, Logger } from '@nestjs/common';
import { FundData, FundFetchError } from './fund-data.interface';
import { YahooFinanceService } from './yahoo-finance.service';

interface CacheEntry {
  data: FundData;
  expiresAt: number;
}

@Injectable()
export class FundsService {
  private readonly logger = new Logger(FundsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(private readonly yahoo: YahooFinanceService) {
    const minutes = Number(process.env.CACHE_TTL_MINUTES ?? 60);
    this.ttlMs = (Number.isFinite(minutes) ? minutes : 60) * 60 * 1000;
  }

  /** Fetch a single instrument (cache-aware). Throws NotFound on bad symbol. */
  async getFund(symbol: string, refresh = false): Promise<FundData> {
    const key = symbol.trim().toUpperCase();
    const cached = this.cache.get(key);
    if (!refresh && cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    const data = await this.yahoo.fetchInstrumentData(key);
    this.cache.set(key, { data, expiresAt: Date.now() + this.ttlMs });
    return data;
  }

  /**
   * Fetch many instruments concurrently. One bad ticker never blocks the rest —
   * failures land in `errors`, successes in `data`.
   */
  async getFunds(
    symbols: string[],
    refresh = false,
  ): Promise<{ data: FundData[]; errors: FundFetchError[] }> {
    const unique = Array.from(
      new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
    );

    const settled = await Promise.allSettled(
      unique.map((s) => this.getFund(s, refresh)),
    );

    const data: FundData[] = [];
    const errors: FundFetchError[] = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        data.push(result.value);
      } else {
        const message =
          result.reason?.message ?? `Failed to fetch ${unique[i]}`;
        errors.push({ symbol: unique[i], message });
      }
    });

    return { data, errors };
  }
}
