import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { LeaveType, RequestState } from '../../src/domain/enums';
import { Balance } from '../../src/modules/balance/entities/balance.entity';
import { TimeOffRequest } from '../../src/modules/time-off/entities/time-off-request.entity';

describe('batch-vs-realtime.spec', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  it('pending_days is recomputed and not overwritten by batch', async () => {
    const now = '2025-01-15T10:00:00Z';
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
      pendingDays: 99,
      hcmLastUpdatedAt: '2025-01-15T09:00:00Z',
      syncedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await ds.getRepository(TimeOffRequest).insert({
      id: randomUUID(),
      idempotencyKey: randomUUID(),
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      startDate: '2025-01-20',
      endDate: '2025-01-22',
      daysRequested: 3,
      state: RequestState.SUBMITTED,
      lastOutboxEvent: null,
      hcmExternalRef: randomUUID(),
      hcmTransactionId: null,
      hcmResponseCode: null,
      hcmResponseBody: null,
      rejectionReason: null,
      failureReason: null,
      retryCount: 0,
      createdBy: 'emp-001',
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    });

    const res = await request(app.getHttpServer())
      .post('/sync/batch/balances')
      .set('Idempotency-Key', randomUUID())
      .send({
        batchId: 'batch-2',
        generatedAt: '2025-01-15T10:05:00Z',
        records: [
          {
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            totalDays: 22,
            usedDays: 6,
            hcmLastUpdatedAt: '2025-01-15T10:04:00Z',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(1);

    const bal = await ds.getRepository(Balance).findOneByOrFail({
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    expect(bal.pendingDays).toBe(3);
    expect(bal.totalDays).toBe(22);
    expect(bal.usedDays).toBe(6);
  });
});

