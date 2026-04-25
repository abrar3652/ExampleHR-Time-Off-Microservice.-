import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { LeaveType, OutboxEventType, RequestState } from '../../src/domain/enums';
import { Balance } from '../../src/modules/balance/entities/balance.entity';
import { HcmDeductionWriter } from '../../src/modules/hcm-client/hcm-deduction-writer.service';
import { OutboxProcessor } from '../../src/modules/outbox/outbox.processor';
import { Outbox } from '../../src/modules/time-off/entities/outbox.entity';
import { TimeOffRequest } from '../../src/modules/time-off/entities/time-off-request.entity';

class MockWriter {
  deductResult: any = {
    success: true,
    statusCode: 200,
    data: { newUsedDays: 1, lastUpdatedAt: new Date().toISOString() },
  };
  reverseResult: any = {
    success: true,
    statusCode: 200,
    data: { newUsedDays: 0, lastUpdatedAt: new Date().toISOString() },
  };

  async deduct(): Promise<any> {
    return this.deductResult;
  }

  async reverse(): Promise<any> {
    return this.reverseResult;
  }
}

describe('outbox.processor branch coverage', () => {
  let app: INestApplication;
  let ds: DataSource;
  let processor: OutboxProcessor;
  let writer: MockWriter;

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    process.env.DISABLE_BACKGROUND_WORKERS = '1';
    writer = new MockWriter();
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HcmDeductionWriter)
      .useValue(writer)
      .compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    processor = app.get(OutboxProcessor);
  });

  afterEach(async () => {
    delete process.env.DISABLE_BACKGROUND_WORKERS;
    await app.close();
  });

  async function seedBase(
    state: RequestState,
    eventType: OutboxEventType,
    attempts: number,
    outboxPayload: Record<string, unknown>,
  ): Promise<Outbox> {
    const now = new Date().toISOString();
    const requestId = randomUUID();
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-u',
        locationId: 'loc-nyc',
        leaveType: LeaveType.ANNUAL,
        totalDays: 5,
        usedDays: eventType === OutboxEventType.HCM_REVERSE ? 1 : 0,
        pendingDays: eventType === OutboxEventType.HCM_DEDUCT ? 1 : 0,
        hcmLastUpdatedAt: now,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      ['employeeId', 'locationId', 'leaveType'],
    );
    await ds.getRepository(TimeOffRequest).insert({
      id: requestId,
      idempotencyKey: randomUUID(),
      employeeId: 'emp-u',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      startDate: '2025-03-07',
      endDate: '2025-03-08',
      daysRequested: 1,
      state,
      lastOutboxEvent: eventType,
      hcmExternalRef: requestId,
      hcmTransactionId: 'txn-1',
      hcmResponseCode: null,
      hcmResponseBody: null,
      rejectionReason: null,
      failureReason: null,
      retryCount: attempts,
      createdBy: 'emp-u',
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    const outbox = ds.getRepository(Outbox).create({
      id: randomUUID(),
      eventType,
      payload: JSON.stringify(outboxPayload),
      requestId,
      status: 'PENDING',
      attempts,
      lastAttemptedAt: null,
      lastError: null,
      createdAt: now,
      processAfter: now,
    });
    await ds.getRepository(Outbox).insert(outbox);
    return outbox;
  }

  it('handles deduct 409 as success path', async () => {
    writer.deductResult = {
      success: false,
      reason: 'CLIENT_ERROR',
      statusCode: 409,
      body: { newUsedDays: 1, lastUpdatedAt: new Date().toISOString() },
    };
    const outbox = await seedBase(RequestState.SUBMITTED, OutboxEventType.HCM_DEDUCT, 0, {
      externalRef: 'ext-1',
      employeeId: 'emp-u',
      locationId: 'loc-nyc',
      leaveType: 'ANNUAL',
      daysRequested: 1,
      startDate: '2025-03-07',
      endDate: '2025-03-08',
    });
    await processor.process(outbox);
    const req = await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: outbox.requestId });
    expect(req.state).toBe(RequestState.APPROVED);
  });

  it('handles deduct client error reject branch', async () => {
    writer.deductResult = {
      success: false,
      reason: 'CLIENT_ERROR',
      statusCode: 422,
      body: { message: 'bad' },
    };
    const outbox = await seedBase(RequestState.PENDING_HCM, OutboxEventType.HCM_DEDUCT, 0, {
      externalRef: 'ext-2',
      employeeId: 'emp-u',
      locationId: 'loc-nyc',
      leaveType: 'ANNUAL',
      daysRequested: 1,
      startDate: '2025-03-07',
      endDate: '2025-03-08',
    });
    await processor.process(outbox);
    const req = await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: outbox.requestId });
    expect(req.state).toBe(RequestState.REJECTED);
  });

  it('handles deduct retry scheduling and failed branch', async () => {
    writer.deductResult = { success: false, reason: 'SERVER_ERROR' };
    const retryOutbox = await seedBase(RequestState.PENDING_HCM, OutboxEventType.HCM_DEDUCT, 0, {
      externalRef: 'ext-3',
      employeeId: 'emp-u',
      locationId: 'loc-nyc',
      leaveType: 'ANNUAL',
      daysRequested: 1,
      startDate: '2025-03-07',
      endDate: '2025-03-08',
    });
    await processor.process(retryOutbox);
    const retryRow = await ds.getRepository(Outbox).findOneByOrFail({ id: retryOutbox.id });
    expect(retryRow.status).toBe('PENDING');

    const failOutbox = await seedBase(RequestState.PENDING_HCM, OutboxEventType.HCM_DEDUCT, 3, {
      externalRef: 'ext-4',
      employeeId: 'emp-u',
      locationId: 'loc-nyc',
      leaveType: 'ANNUAL',
      daysRequested: 1,
      startDate: '2025-03-07',
      endDate: '2025-03-08',
    });
    await processor.process(failOutbox);
    const failedReq = await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: failOutbox.requestId });
    expect(failedReq.state).toBe(RequestState.FAILED);
  });

  it('handles reverse success/409/client/server branches', async () => {
    // success
    writer.reverseResult = { success: true, statusCode: 200, data: { newUsedDays: 0, lastUpdatedAt: new Date().toISOString() } };
    const successOutbox = await seedBase(RequestState.CANCELLING, OutboxEventType.HCM_REVERSE, 0, {
      externalRef: 'ext-r1',
      hcmTransactionId: 'txn-1',
      employeeId: 'emp-u',
      locationId: 'loc-nyc',
      leaveType: 'ANNUAL',
      days: 1,
    });
    await processor.process(successOutbox);
    expect((await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: successOutbox.requestId })).state).toBe(
      RequestState.CANCELLED,
    );

    // 409 success-like
    writer.reverseResult = {
      success: false,
      reason: 'CLIENT_ERROR',
      statusCode: 409,
      body: { newUsedDays: 0, lastUpdatedAt: new Date().toISOString() },
    };
    const conflictOutbox = await seedBase(RequestState.CANCELLING, OutboxEventType.HCM_REVERSE, 0, {
      externalRef: 'ext-r2',
      hcmTransactionId: 'txn-1',
      employeeId: 'emp-u',
      locationId: 'loc-nyc',
      leaveType: 'ANNUAL',
      days: 1,
    });
    await processor.process(conflictOutbox);
    expect((await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: conflictOutbox.requestId })).state).toBe(
      RequestState.CANCELLED,
    );

    // client error -> REVERSAL_REJECTED
    writer.reverseResult = { success: false, reason: 'CLIENT_ERROR', statusCode: 404, body: { message: 'missing' } };
    const rejectOutbox = await seedBase(RequestState.CANCELLING, OutboxEventType.HCM_REVERSE, 0, {
      externalRef: 'ext-r3',
      hcmTransactionId: 'missing',
      employeeId: 'emp-u',
      locationId: 'loc-nyc',
      leaveType: 'ANNUAL',
      days: 1,
    });
    await processor.process(rejectOutbox);
    expect((await ds.getRepository(Outbox).findOneByOrFail({ id: rejectOutbox.id })).lastError).toBe('REVERSAL_REJECTED');

    // server retry then fail
    writer.reverseResult = { success: false, reason: 'SERVER_ERROR' };
    const retryOutbox = await seedBase(RequestState.CANCELLING, OutboxEventType.HCM_REVERSE, 0, {
      externalRef: 'ext-r4',
      hcmTransactionId: 'txn-1',
      employeeId: 'emp-u',
      locationId: 'loc-nyc',
      leaveType: 'ANNUAL',
      days: 1,
    });
    await processor.process(retryOutbox);
    expect((await ds.getRepository(Outbox).findOneByOrFail({ id: retryOutbox.id })).status).toBe('PENDING');

    const failOutbox = await seedBase(RequestState.CANCELLING, OutboxEventType.HCM_REVERSE, 3, {
      externalRef: 'ext-r5',
      hcmTransactionId: 'txn-1',
      employeeId: 'emp-u',
      locationId: 'loc-nyc',
      leaveType: 'ANNUAL',
      days: 1,
    });
    await processor.process(failOutbox);
    expect((await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: failOutbox.requestId })).state).toBe(
      RequestState.FAILED,
    );
  });
});
