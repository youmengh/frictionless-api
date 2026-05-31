import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { allocateBySOI } from '../soi/soi-engine';
import { SoiResult } from '../soi/soi.types';
import { AllocateRequestDto } from './dto/allocate.dto';

@ApiTags('allocate')
@Controller('allocate')
export class AllocateController {
  @Post()
  @ApiOperation({
    summary: 'Run the SOI allocation algorithm',
    description:
      'Screens, scores (SOI = 10·r − 100·x − 20·max(0, β−1)), weights, and ' +
      'allocates capital across the supplied funds. The backend re-validates ' +
      'and computes — it does not trust client-side math.',
  })
  @ApiOkResponse({
    description: 'Allocations (sorted by SOI desc), rejections, and totals.',
  })
  run(@Body() body: AllocateRequestDto): SoiResult {
    const universe = body.funds.map((f) => ({
      symbol: f.symbol,
      expenseRatio: f.expenseRatio ?? null,
      longTermReturn: f.longTermReturn ?? null,
      beta: f.beta ?? null,
    }));

    return allocateBySOI(universe, body.allocatedCapital, {
      maxExpenseRatio: body.options?.maxExpenseRatio,
      minLongTermReturn: body.options?.minLongTermReturn,
      betaPenaltyCoefficient: body.options?.betaPenaltyCoefficient,
    });
  }
}
