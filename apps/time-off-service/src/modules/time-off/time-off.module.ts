import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BalanceModule } from '../balance/balance.module';
import { Outbox } from './entities/outbox.entity';
import { RequestAuditLog } from './entities/request-audit-log.entity';
import { TimeOffRequest } from './entities/time-off-request.entity';
import { TimeOffController } from './time-off.controller';
import { TimeOffService } from './time-off.service';

@Module({
  imports: [TypeOrmModule.forFeature([TimeOffRequest, Outbox, RequestAuditLog]), BalanceModule],
  controllers: [TimeOffController],
  providers: [TimeOffService],
})
export class TimeOffModule {}

