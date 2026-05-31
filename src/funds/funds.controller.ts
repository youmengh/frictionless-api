import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FundData, FundFetchError } from './fund-data.interface';
import { FundsService } from './funds.service';

@ApiTags('funds')
@Controller('funds')
export class FundsController {
  constructor(private readonly funds: FundsService) {}

  @Get('validate')
  @ApiOperation({
    summary: 'Validate & fetch a single symbol (used by "add to universe")',
    description:
      'Returns full instrument data for a ticker, or 404 if Yahoo Finance ' +
      'does not recognize it. Funds, ETFs, and individual stocks are all ' +
      'accepted; stocks get expense ratio 0 and a price-history return.',
  })
  @ApiQuery({ name: 'symbol', example: 'FSELX' })
  async validate(@Query('symbol') symbol: string): Promise<FundData> {
    return this.funds.getFund(symbol);
  }

  @Get()
  @ApiOperation({
    summary: 'Batch-fetch live data for comma-separated symbols',
    description:
      'Fetches all symbols concurrently. Bad tickers are reported in `errors` ' +
      'without failing the rest. Pass refresh=true to bypass the cache.',
  })
  @ApiQuery({ name: 'symbols', example: 'FSELX,VTI,QQQM' })
  @ApiQuery({ name: 'refresh', required: false, example: false })
  @ApiOkResponse({ description: '{ data: FundData[], errors: FundFetchError[] }' })
  async getMany(
    @Query('symbols') symbols = '',
    @Query('refresh') refresh = 'false',
  ): Promise<{ data: FundData[]; errors: FundFetchError[] }> {
    const list = symbols
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.funds.getFunds(list, refresh === 'true');
  }
}
