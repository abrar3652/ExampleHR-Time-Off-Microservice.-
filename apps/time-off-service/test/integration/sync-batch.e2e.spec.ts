import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { LeaveType } from '../../src/domain/enums';
import { Balance } from '../../src/modules/balance/entities/balance.entity';
import { SyncCheckpoint } from '../../src/modules/sync/entities/sync-checkpoint.entity';

describe('sync-batch.e2e', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    process.env.DISABLE_BACKGROUND_WORKERS = '1';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });

  afterEach(async () => {
    delete process.env.DISABLE_BACKGROUND_WORKERS;
    await app.close();
  });

  it('older hcm_last_updated_at is skipped and checkpoint is updated', async () => {
    await ds.getRepository(SyncCheckpoint).delete({ id: 'singleton' });
    await ds.getRepository(Balance).delete({
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    await ds.getRepository(Balance).insert({
      id: randomUUID(),
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      totalDays: 20,
      usedDays: 5,
      pendingDays: 2,
      hcmLastUpdatedAt: '2025-01-15T09:55:00Z',
      syncedAt: '2025-01-15T10:00:00Z',
      createdAt: '2025-01-15T10:00:00Z',
      updatedAt: '2025-01-15T10:00:00Z',
    });

    const res = await request(app.getHttpServer())
      .post('/sync/batch/balances')
      .set('Idempotency-Key', randomUUID())
      .send({
        batchId: 'batch-1',
        generatedAt: '2025-01-15T10:05:00Z',
        records: [
          {
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            totalDays: 30,
            usedDays: 9,
            hcmLastUpdatedAt: '2025-01-15T09:50:00Z',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(0);
    expect(res.body.skipped).toBe(1);
    expect(res.body.failed).toBe(0);

    const cp = await ds.getRepository(SyncCheckpoint).findOneByOrFail({ id: 'singleton' });
    expect(cp.lastBatchId).toBe('batch-1');
    expect(cp.lastBatchAt).toBe('2025-01-15T10:05:00Z');
    expect(cp.lastRecordCount).toBe(0);
  });
});

