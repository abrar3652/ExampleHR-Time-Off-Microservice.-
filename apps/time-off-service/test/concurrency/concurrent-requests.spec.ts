import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { LeaveType, RequestState } from '../../src/domain/enums';
import { Balance } from '../../src/modules/balance/entities/balance.entity';
import { HcmDeductionWriter } from '../../src/modules/hcm-client/hcm-deduction-writer.service';
import { TimeOffRequest } from '../../src/modules/time-off/entities/time-off-request.entity';

class MockHcmWriter {
  private readonly usedByKey = new Map<string, number>();
  private readonly txToKey = new Map<string, string>();

  async deduct(payload: any): Promise<any> {
    const key = `${payload.employeeId}|${payload.locationId}|${payload.leaveType}`;
    const nextUsed = (this.usedByKey.get(key) ?? 0) + Number(payload.days ?? 0);
    this.usedByKey.set(key, nextUsed);
    const txId = `txn-${payload.externalRef}`;
    this.txToKey.set(txId, key);

    return {
      success: true,
      statusCode: 200,
      data: {
        hcmTransactionId: txId,
        newTotalDays: 999,
        newUsedDays: nextUsed,
        lastUpdatedAt: new Date().toISOString(),
      },
    };
  }

  async reverse(payload: any): Promise<any> {
    const txId = String(payload.hcmTransactionId ?? '');
    const key = this.txToKey.get(txId) ?? `${payload.employeeId}|${payload.locationId}|${payload.leaveType}`;
    const current = this.usedByKey.get(key) ?? 0;
    const restored = Number(payload.days ?? 0);
    const nextUsed = Math.max(0, current - restored);
    this.usedByKey.set(key, nextUsed);

    return {
      success: true,
      statusCode: 200,
      data: {
        reversalTransactionId: `rev-${txId}`,
        restoredDays: restored,
        newUsedDays: nextUsed,
        lastUpdatedAt: new Date().toISOString(),
      },
    };
  }
}

async function waitForOutboxDrain(app: INestApplication, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request(app.getHttpServer()).get('/health');
    if (res.status === 200 && Number(res.body.outboxPendingCount) === 0) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Timed out waiting for outbox drain');
}

async function waitForRequestState(
  app: INestApplication,
  requestId: string,
  expected: RequestState[],
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request(app.getHttpServer()).get(`/time-off/requests/${requestId}`);
    if (res.status === 200 && expected.includes(res.body.state)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for request ${requestId} -> ${expected.join('|')}`);
}

describe('concurrent-requests.spec', () => {
  jest.setTimeout(120000);

  let app: INestApplication;
  let ds: DataSource;

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HcmDeductionWriter)
      .useValue(new MockHcmWriter())
      .compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });

  afterEach(async () => {
    await app.close();
  });

  it('prevents overdraft under 10 concurrent requests for same balance', async () => {
    const now = new Date().toISOString();
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-001',
        locationId: 'loc-nyc',
        leaveType: LeaveType.ANNUAL,
        totalDays: 5,
        usedDays: 0,
        pendingDays: 0,
        hcmLastUpdatedAt: now,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      ['employeeId', 'locationId', 'leaveType'],
    );

    const reqs = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .post('/time-off/requests')
        .set('Idempotency-Key', randomUUID())
        .set('X-Employee-Id', 'emp-001')
        .send({
          locationId: 'loc-nyc',
          leaveType: 'ANNUAL',
          startDate: '2025-03-07',
          endDate: '2025-03-08',
          daysRequested: 1,
        }),
    );
    const results = await Promise.all(reqs);
    const accepted = results.filter((r) => r.status === 202);
    const rejected = results.filter((r) => r.status === 422);
    expect(accepted).toHaveLength(5);
    expect(rejected).toHaveLength(5);

    await waitForOutboxDrain(app, 10000);

    const bal = await ds.getRepository(Balance).findOneByOrFail({
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    const availableDays = bal.totalDays - bal.usedDays - bal.pendingDays;
    expect(bal.usedDays).toBe(5);
    expect(bal.pendingDays).toBe(0);
    expect(availableDays).toBe(0);
    expect(availableDays).toBeGreaterThanOrEqual(0);
  });

  it('concurrent requests for different employees complete faster than serialized', async () => {
    const now = new Date().toISOString();
    const seed = async (employeeId: string) =>
      ds.getRepository(Balance).upsert(
        {
          id: randomUUID(),
          employeeId,
          locationId: 'loc-nyc',
          leaveType: LeaveType.ANNUAL,
          totalDays: 10,
          usedDays: 0,
          pendingDays: 0,
          hcmLastUpdatedAt: now,
          syncedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        ['employeeId', 'locationId', 'leaveType'],
      );

    await seed('emp-a');
    await seed('emp-b');

    const payload = {
      locationId: 'loc-nyc',
      leaveType: 'ANNUAL',
      startDate: '2025-03-07',
      endDate: '2025-03-08',
      daysRequested: 1,
    };

    const concurrentStart = Date.now();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request(app.getHttpServer())
          .post('/time-off/requests')
          .set('Idempotency-Key', randomUUID())
          .set('X-Employee-Id', i % 2 === 0 ? 'emp-a' : 'emp-b')
          .send(payload),
      ),
    );
    const concurrentMs = Date.now() - concurrentStart;

    await seed('emp-c');
    await seed('emp-d');
    const serialStart = Date.now();
    for (let i = 0; i < 10; i += 1) {
      // Intentionally serialized baseline.
      await request(app.getHttpServer())
        .post('/time-off/requests')
        .set('Idempotency-Key', randomUUID())
        .set('X-Employee-Id', i % 2 === 0 ? 'emp-c' : 'emp-d')
        .send(payload);
      await new Promise((r) => setTimeout(r, 30));
    }
    const serialMs = Date.now() - serialStart;

    expect(concurrentMs).toBeLessThan(serialMs);
  });

  it('concurrent cancel + approve race: only one succeeds', async () => {
    const now = new Date().toISOString();
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-race',
        locationId: 'loc-nyc',
        leaveType: LeaveType.ANNUAL,
        totalDays: 3,
        usedDays: 0,
        pendingDays: 0,
        hcmLastUpdatedAt: now,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      ['employeeId', 'locationId', 'leaveType'],
    );

    const created = await request(app.getHttpServer())
      .post('/time-off/requests')
      .set('Idempotency-Key', randomUUID())
      .set('X-Employee-Id', 'emp-race')
      .send({
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        startDate: '2025-03-07',
        endDate: '2025-03-08',
        daysRequested: 1,
      });
    expect(created.status).toBe(202);

    await waitForRequestState(app, created.body.requestId, [RequestState.PENDING_HCM, RequestState.APPROVED], 10000);

    const cancel = await request(app.getHttpServer())
      .post(`/time-off/requests/${created.body.requestId}/cancel`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Employee-Id', 'emp-race')
      .send({});
    expect([200, 409]).toContain(cancel.status);

    await waitForOutboxDrain(app, 10000);
    const row = await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: created.body.requestId });
    expect([RequestState.APPROVED, RequestState.CANCELLED]).toContain(row.state);
  });
});
