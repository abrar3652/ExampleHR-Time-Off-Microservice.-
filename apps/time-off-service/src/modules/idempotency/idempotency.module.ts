import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdempotencyCleanupJob } from './idempotency.cleanup';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyRecord } from './entities/idempotency-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord]), ScheduleModule.forRoot()],
  providers: [IdempotencyRepository, IdempotencyInterceptor, IdempotencyCleanupJob],
  exports: [IdempotencyInterceptor, IdempotencyRepository],
})
export class IdempotencyModule {}

