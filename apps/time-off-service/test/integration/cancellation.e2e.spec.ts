import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { LeaveType, OutboxEventType, RequestState } from '../../src/domain/enums';
import { Balance } from '../../src/modules/balance/entities/balance.entity';
import { HcmDeductionWriter } from '../../src/modules/hcm-client/hcm-deduction-writer.service';
import { Outbox } from '../../src/modules/time-off/entities/outbox.entity';
import { TimeOffRequest } from '../../src/modules/time-off/entities/time-off-request.entity';

class MockWriter {
  async deduct(payload: any): Promise<any> {
    return {
      success: true,
      statusCode: 200,
      data: {
        hcmTransactionId: `txn-${payload.externalRef}`,
        newTotalDays: 20,
        newUsedDays: 8,
        lastUpdatedAt: new Date().toISOString(),
      },
    };
  }
  async reverse(): Promise<any> {
    return {
      success: true,
      statusCode: 200,
      data: { hcmTransactionId: 'rev-1', newTotalDays: 20, newUsedDays: 5, lastUpdatedAt: new Date().toISOString() },
    };
  }
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Timed out waiting for condition');
}

describe('cancellation.e2e', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HcmDeductionWriter)
      .useValue(new MockWriter())
      .compile();

    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);

    const now = new Date().toISOString();
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
      pendingDays: 0,
      hcmLastUpdatedAt: now,
      syncedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('Cancel SUBMITTED request -> CANCELLED and pending restored', async () => {
    const reqId = randomUUID();
    const now = new Date().toISOString();
    await ds.getRepository(TimeOffRequest).insert({
      id: reqId,
      idempotencyKey: randomUUID(),
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      startDate: '2025-02-10',
      endDate: '2025-02-12',
      daysRequested: 3,
      state: RequestState.SUBMITTED,
      lastOutboxEvent: OutboxEventType.HCM_DEDUCT,
      hcmExternalRef: reqId,
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
    await ds
      .getRepository(Balance)
      .update(
        { employeeId: 'emp-001', locationId: 'loc-nyc', leaveType: LeaveType.ANNUAL },
        { pendingDays: 3, updatedAt: now },
      );

    const cancel = await request(app.getHttpServer())
      .post(`/time-off/requests/${reqId}/cancel`)
      .set('X-Employee-Id', 'emp-001')
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.state).toBe('CANCELLED');

    const req = await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: reqId });
    expect(req.state).toBe(RequestState.CANCELLED);
  });

  it('Cancel APPROVED request -> reversal outbox then CANCELLED', async () => {
    const create = await request(app.getHttpServer())
      .post('/time-off/requests')
      .set('X-Employee-Id', 'emp-001')
      .set('Idempotency-Key', randomUUID())
      .send({
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        startDate: '2025-02-10',
        endDate: '2025-02-12',
        daysRequested: 3,
      });
    expect(create.status).toBe(202);

    await waitFor(async () => {
      const req = await ds.getRepository(TimeOffRequest).findOneBy({ id: create.body.requestId });
      return req?.state === RequestState.APPROVED;
    }, 4000);

    const cancel = await request(app.getHttpServer())
      .post(`/time-off/requests/${create.body.requestId}/cancel`)
      .set('X-Employee-Id', 'emp-001')
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(cancel.status).toBe(200);

    const outbox = await ds.getRepository(Outbox).findOneBy({ requestId: create.body.requestId, eventType: OutboxEventType.HCM_REVERSE });
    expect(outbox).toBeTruthy();

    await waitFor(async () => {
      const req = await ds.getRepository(TimeOffRequest).findOneBy({ id: create.body.requestId });
      return req?.state === RequestState.CANCELLED;
    }, 4000);

    const bal = await ds.getRepository(Balance).findOneByOrFail({
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    expect(bal.usedDays).toBe(5);
  });

  it('Cancel REJECTED request -> 409 invalid transition', async () => {
    const reqId = randomUUID();
    const now = new Date().toISOString();
    await ds.getRepository(TimeOffRequest).insert({
      id: reqId,
      idempotencyKey: randomUUID(),
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      startDate: '2025-02-10',
      endDate: '2025-02-12',
      daysRequested: 3,
      state: RequestState.REJECTED,
      lastOutboxEvent: null,
      hcmExternalRef: reqId,
      hcmTransactionId: null,
      hcmResponseCode: null,
      hcmResponseBody: null,
      rejectionReason: 'x',
      failureReason: null,
      retryCount: 0,
      createdBy: 'emp-001',
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    });

    const cancel = await request(app.getHttpServer())
      .post(`/time-off/requests/${reqId}/cancel`)
      .set('X-Employee-Id', 'emp-001')
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(cancel.status).toBe(409);
  });

  it('Cancel CANCELLED request -> 409 invalid transition', async () => {
    const reqId = randomUUID();
    const now = new Date().toISOString();
    await ds.getRepository(TimeOffRequest).insert({
      id: reqId,
      idempotencyKey: randomUUID(),
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      startDate: '2025-02-10',
      endDate: '2025-02-12',
      daysRequested: 3,
      state: RequestState.CANCELLED,
      lastOutboxEvent: null,
      hcmExternalRef: reqId,
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

    const cancel = await request(app.getHttpServer())
      .post(`/time-off/requests/${reqId}/cancel`)
      .set('X-Employee-Id', 'emp-001')
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(cancel.status).toBe(409);
  });
});

