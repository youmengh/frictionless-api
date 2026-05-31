import { Module } from '@nestjs/common';
import { AllocateController } from './allocate/allocate.controller';
import { FundsController } from './funds/funds.controller';
import { FundsService } from './funds/funds.service';
import { YahooFinanceService } from './funds/yahoo-finance.service';
import { HealthController } from './health/health.controller';

@Module({
  controllers: [HealthController, FundsController, AllocateController],
  providers: [FundsService, YahooFinanceService],
})
export class AppModule {}
