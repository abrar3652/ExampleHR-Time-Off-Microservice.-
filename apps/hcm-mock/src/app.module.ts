import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';

import { HcmBalance } from './entities/hcm-balance.entity';
import { HcmBatchSnapshot } from './entities/hcm-batch-snapshot.entity';
import { HcmCallLog } from './entities/hcm-call-log.entity';
import { HcmChaosConfig } from './entities/hcm-chaos-config.entity';
import { HcmInternalClock } from './entities/hcm-internal-clock.entity';
import { HcmTransaction } from './entities/hcm-transaction.entity';

async function ensureSingletonRows(dataSource: DataSource): Promise<void> {
  const chaosRepo = dataSource.getRepository(HcmChaosConfig);
  const clockRepo = dataSource.getRepository(HcmInternalClock);

  await chaosRepo.upsert({ id: 'singleton', config: '{}' }, ['id']);
  await clockRepo.upsert({ id: 'singleton', offsetMs: 0 }, ['id']);
}

async function hcmNow(dataSource: DataSource): Promise<string> {
  const clockRepo = dataSource.getRepository(HcmInternalClock);
  const clock = await clockRepo.findOneBy({ id: 'singleton' });
  const offsetMs = clock?.offsetMs ?? 0;
  return new Date(Date.now() + offsetMs).toISOString();
}

async function seedBalancesForTestMode(dataSource: DataSource): Promise<void> {
  if (process.env.NODE_ENV !== 'test') return;

  const balanceRepo = dataSource.getRepository(HcmBalance);
  const existingCount = await balanceRepo.count();
  if (existingCount > 0) return;

  const now = await hcmNow(dataSource);
  const seedBalances = [
    { employeeId: 'emp-001', locationId: 'loc-nyc', leaveType: 'ANNUAL', totalDays: 20, usedDays: 0 },
    { employeeId: 'emp-001', locationId: 'loc-nyc', leaveType: 'SICK', totalDays: 10, usedDays: 2 },
    { employeeId: 'emp-002', locationId: 'loc-nyc', leaveType: 'ANNUAL', totalDays: 15, usedDays: 5 },
    { employeeId: 'emp-002', locationId: 'loc-la', leaveType: 'ANNUAL', totalDays: 15, usedDays: 0 },
    { employeeId: 'emp-003', locationId: 'loc-nyc', leaveType: 'ANNUAL', totalDays: 0, usedDays: 0 },
  ];

  await balanceRepo.insert(
    seedBalances.map((b) => ({
      employeeId: b.employeeId,
      locationId: b.locationId,
      leaveType: b.leaveType,
      totalDays: b.totalDays,
      usedDays: b.usedDays,
      lastUpdatedAt: now,
      createdAt: now,
    })),
  );
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: async (): Promise<DataSourceOptions> => ({
        type: 'better-sqlite3',
        database: process.env.DB_PATH ?? './hcm-mock.db',
        enableWAL: true,
        prepareDatabase: (db: { pragma: (sql: string) => unknown }) => {
          db.pragma('busy_timeout = 5000');
        },
        entities: [HcmBalance, HcmTransaction, HcmChaosConfig, HcmCallLog, HcmInternalClock, HcmBatchSnapshot],
        synchronize: true,
      }),
      dataSourceFactory: async (options) => {
        if (!options) throw new Error('TypeORM options missing');
        const dataSource = new DataSource(options);
        await dataSource.initialize();
        await ensureSingletonRows(dataSource);
        await seedBalancesForTestMode(dataSource);
        return dataSource;
      },
    }),
  ],
})
export class AppModule {}

