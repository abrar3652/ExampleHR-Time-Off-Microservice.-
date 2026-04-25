import { INestApplication } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import axios from 'axios';

import { AppModule } from '../../src/app.module';
import { LeaveType, OutboxEventType, RequestState } from '../../src/domain/enums';
import { HcmClient } from '../../src/modules/hcm-client/hcm-client.service';
import { Balance } from '../../src/modules/balance/entities/balance.entity';
import { Outbox } from '../../src/modules/time-off/entities/outbox.entity';
import { TimeOffRequest } from '../../src/modules/time-off/entities/time-off-request.entity';
import { HcmMockControl } from '../helpers/hcm-mock-control';

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForHcm(baseUrl: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${baseUrl}/__control/call-log`);
      if (r.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Timed out waiting for hcm-mock');
}

function startHcmMock(port: number): ChildProcess {
  return spawn('npm', ['run', 'start:dev'], {
    cwd: resolve(__dirname, '../../../..', 'apps/hcm-mock'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DB_PATH: `./hcm-outbox-retry-${port}.sqlite`,
    },
    shell: true,
    stdio: 'ignore',
  });
}

function makeHcmClient(baseURL: string): HcmClient {
  const http = axios.create({ baseURL });
  return {
    axios: http,
    callHcm: async (fn: any) => {
      try {
        const response = await Promise.race([
          fn(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('HCM_TIMEOUT')), 8000)),
        ]);
        return { success: true, data: response.data, statusCode: response.status };
      } catch (err: any) {
        if (err.message === 'HCM_TIMEOUT') return { success: false, reason: 'TIMEOUT' };
        if (err.response) {
          const { status, data } = err.response;
          return { success: false, reason: status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR', statusCode: status, body: data };
        }
        return { success: false, reason: 'NETWORK_ERROR' };
      }
    },
  } as unknown as HcmClient;
}

describe('outbox-retry.spec', () => {
  jest.setTimeout(120000);

  const hcmPort = 4104;
  const hcmBaseUrl = `http://localhost:${hcmPort}`;
  let hcmProc: ChildProcess;
  let hcm: HcmMockControl;
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    hcmProc = startHcmMock(hcmPort);
    await waitForHcm(hcmBaseUrl, 30000);
  });

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HcmClient)
      .useValue(makeHcmClient(hcmBaseUrl))
      .compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    hcm = new HcmMockControl(hcmBaseUrl);
  });

  afterEach(async () => {
    if (hcm) await hcm.reset();
    if (app) await app.close();
  });

  afterAll(async () => {
    if (hcmProc?.pid) hcmProc.kill('SIGTERM');
  });

  it('PROCESSING records older than 30s are re-queued and processed', async () => {
    const now = new Date().toISOString();
    await hcm.setBalance('emp-retry-1', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 0, hcmLastUpdatedAt: now });
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-retry-1',
        locationId: 'loc-nyc',
        leaveType: LeaveType.ANNUAL,
        totalDays: 5,
        usedDays: 0,
        pendingDays: 1,
        hcmLastUpdatedAt: now,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      ['employeeId', 'locationId', 'leaveType'],
    );
    const reqId = randomUUID();
    await ds.getRepository(TimeOffRequest).insert({
      id: reqId,
      idempotencyKey: randomUUID(),
      employeeId: 'emp-retry-1',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      startDate: '2025-03-07',
      endDate: '2025-03-08',
      daysRequested: 1,
      state: RequestState.PENDING_HCM,
      lastOutboxEvent: OutboxEventType.HCM_DEDUCT,
      hcmExternalRef: reqId,
      hcmTransactionId: null,
      hcmResponseCode: null,
      hcmResponseBody: null,
      rejectionReason: null,
      failureReason: null,
      retryCount: 0,
      createdBy: 'emp-retry-1',
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    await ds.getRepository(Outbox).insert({
      id: randomUUID(),
      eventType: OutboxEventType.HCM_DEDUCT,
      payload: JSON.stringify({
        externalRef: reqId,
        employeeId: 'emp-retry-1',
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        daysRequested: 1,
        startDate: '2025-03-07',
        endDate: '2025-03-08',
      }),
      requestId: reqId,
      status: 'PROCESSING',
      attempts: 0,
      lastAttemptedAt: new Date(Date.now() - 31_000).toISOString(),
      lastError: null,
      createdAt: now,
      processAfter: now,
    });

    await sleep(2500);

    const outbox = await ds.getRepository(Outbox).findOneByOrFail({ requestId: reqId });
    const req = await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: reqId });
    expect(outbox.status).toBe('DONE');
    expect(req.state).toBe('APPROVED');
  });

  it('safety guard marks record FAILED when attempts exceed max', async () => {
    const now = new Date().toISOString();
    await hcm.setBalance('emp-retry-2', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 0, hcmLastUpdatedAt: now });
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-retry-2',
        locationId: 'loc-nyc',
        leaveType: LeaveType.ANNUAL,
        totalDays: 5,
        usedDays: 0,
        pendingDays: 1,
        hcmLastUpdatedAt: now,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      ['employeeId', 'locationId', 'leaveType'],
    );
    const requestId = randomUUID();
    await ds.getRepository(TimeOffRequest).insert({
      id: requestId,
      idempotencyKey: randomUUID(),
      employeeId: 'emp-retry-2',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      startDate: '2025-03-07',
      endDate: '2025-03-08',
      daysRequested: 1,
      state: RequestState.PENDING_HCM,
      lastOutboxEvent: OutboxEventType.HCM_DEDUCT,
      hcmExternalRef: requestId,
      hcmTransactionId: null,
      hcmResponseCode: null,
      hcmResponseBody: null,
      rejectionReason: null,
      failureReason: null,
      retryCount: 3,
      createdBy: 'emp-retry-2',
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    await ds.getRepository(Outbox).insert({
      id: randomUUID(),
      eventType: OutboxEventType.HCM_DEDUCT,
      payload: JSON.stringify({
        externalRef: requestId,
        employeeId: 'emp-retry-2',
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        daysRequested: 1,
        startDate: '2025-03-07',
        endDate: '2025-03-08',
      }),
      requestId,
      status: 'PENDING',
      attempts: 3,
      lastAttemptedAt: null,
      lastError: null,
      createdAt: now,
      processAfter: now,
    });

    await sleep(2000);

    const outbox = await ds.getRepository(Outbox).findOneByOrFail({ requestId });
    const requestRow = await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: requestId });
    expect(outbox.status).toBe('FAILED');
    expect(outbox.lastError).toBe('SAFETY_GUARD_EXCEEDED');
    expect(requestRow.state).toBe(RequestState.FAILED);
  });

  it('reverse client error marks FAILED with REVERSAL_REJECTED', async () => {
    const now = new Date().toISOString();
    await hcm.setBalance('emp-retry-3', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 1, hcmLastUpdatedAt: now });
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-retry-3',
        locationId: 'loc-nyc',
        leaveType: LeaveType.ANNUAL,
        totalDays: 5,
        usedDays: 1,
        pendingDays: 0,
        hcmLastUpdatedAt: now,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      ['employeeId', 'locationId', 'leaveType'],
    );
    const requestId = randomUUID();
    await ds.getRepository(TimeOffRequest).insert({
      id: requestId,
      idempotencyKey: randomUUID(),
      employeeId: 'emp-retry-3',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      startDate: '2025-03-07',
      endDate: '2025-03-08',
      daysRequested: 1,
      state: RequestState.CANCELLING,
      lastOutboxEvent: OutboxEventType.HCM_REVERSE,
      hcmExternalRef: requestId,
      hcmTransactionId: 'missing-txn',
      hcmResponseCode: null,
      hcmResponseBody: null,
      rejectionReason: null,
      failureReason: null,
      retryCount: 0,
      createdBy: 'emp-retry-3',
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    await ds.getRepository(Outbox).insert({
      id: randomUUID(),
      eventType: OutboxEventType.HCM_REVERSE,
      payload: JSON.stringify({
        externalRef: requestId,
        hcmTransactionId: 'missing-txn',
        employeeId: 'emp-retry-3',
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        days: 1,
      }),
      requestId,
      status: 'PENDING',
      attempts: 0,
      lastAttemptedAt: null,
      lastError: null,
      createdAt: now,
      processAfter: now,
    });

    await sleep(2500);

    const outbox = await ds.getRepository(Outbox).findOneByOrFail({ requestId });
    const requestRow = await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: requestId });
    expect(outbox.status).toBe('FAILED');
    expect(outbox.lastError).toBe('REVERSAL_REJECTED');
    expect(requestRow.state).toBe(RequestState.FAILED);
  });

  it('reverse server error schedules retry', async () => {
    const now = new Date().toISOString();
    await hcm.setBalance('emp-retry-4', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 1, hcmLastUpdatedAt: now });
    await hcm.setNextCallBehavior('reverse', '500', 1);
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-retry-4',
        locationId: 'loc-nyc',
        leaveType: LeaveType.ANNUAL,
        totalDays: 5,
        usedDays: 1,
        pendingDays: 0,
        hcmLastUpdatedAt: now,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      ['employeeId', 'locationId', 'leaveType'],
    );
    const requestId = randomUUID();
    await ds.getRepository(TimeOffRequest).insert({
      id: requestId,
      idempotencyKey: randomUUID(),
      employeeId: 'emp-retry-4',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      startDate: '2025-03-07',
      endDate: '2025-03-08',
      daysRequested: 1,
      state: RequestState.CANCELLING,
      lastOutboxEvent: OutboxEventType.HCM_REVERSE,
      hcmExternalRef: requestId,
      hcmTransactionId: 'txn-reverse',
      hcmResponseCode: null,
      hcmResponseBody: null,
      rejectionReason: null,
      failureReason: null,
      retryCount: 0,
      createdBy: 'emp-retry-4',
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    await ds.getRepository(Outbox).insert({
      id: randomUUID(),
      eventType: OutboxEventType.HCM_REVERSE,
      payload: JSON.stringify({
        externalRef: requestId,
        hcmTransactionId: 'txn-reverse',
        employeeId: 'emp-retry-4',
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        days: 1,
      }),
      requestId,
      status: 'PENDING',
      attempts: 0,
      lastAttemptedAt: null,
      lastError: null,
      createdAt: now,
      processAfter: now,
    });

    await sleep(2500);

    const outbox = await ds.getRepository(Outbox).findOneByOrFail({ requestId });
    expect(outbox.status).toBe('PENDING');
    expect(outbox.attempts).toBe(1);
    expect(outbox.lastError).toBe('SERVER_ERROR');
  });
});

