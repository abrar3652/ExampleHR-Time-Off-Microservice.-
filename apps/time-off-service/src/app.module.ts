import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { BalanceModule } from './modules/balance/balance.module';
import { IdempotencyInterceptor } from './modules/idempotency/idempotency.interceptor';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DB_PATH ?? './data/time_off.sqlite',
      enableWAL: true,
      prepareDatabase: (db: { pragma: (sql: string) => unknown }) => {
        db.pragma('busy_timeout = 5000');
      },
      autoLoadEntities: true,
      synchronize: true,
    }),
    BalanceModule,
    IdempotencyModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}

