import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { HcmClientModule } from '../hcm-client/hcm-client.module';
import { BalanceController } from './balance.controller';
import { BalanceRepository } from './balance.repository';
import { BalanceService } from './balance.service';
import { BalanceChangeLog } from './entities/balance-change-log.entity';
import { Balance } from './entities/balance.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Balance, BalanceChangeLog]), HcmClientModule],
  controllers: [BalanceController],
  providers: [BalanceRepository, BalanceService],
  exports: [BalanceService, BalanceRepository],
})
export class BalanceModule {}

