import { INestApplication } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import axios from 'axios';

import { AppModule } from '../../src/app.module';
import { LeaveType } from '../../src/domain/enums';
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

async function waitForRequestState(ds: DataSource, id: string, state: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await ds.getRepository(TimeOffRequest).findOneBy({ id });
    if (row?.state === state) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for request state ${state}`);
}

function startHcmMock(port: number): ChildProcess {
  return spawn('npm', ['run', 'start:dev'], {
    cwd: resolve(__dirname, '../../../..', 'apps/hcm-mock'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DB_PATH: `./hcm-timeout-${port}.sqlite`,
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

describe('hcm-timeout.spec (FS-1)', () => {
  jest.setTimeout(180000);

  const hcmPort = 4101;
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

  it('timeout keeps request PENDING_HCM and schedules retry', async () => {
    const now = new Date().toISOString();
    await hcm.setBalance('emp-timeout-1', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 0, hcmLastUpdatedAt: now });
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-timeout-1',
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
    await hcm.setNextCallBehavior('deduct', 'timeout', 1);

    const create = await request(app.getHttpServer())
      .post('/time-off/requests')
      .set('X-Employee-Id', 'emp-timeout-1')
      .set('Idempotency-Key', randomUUID())
      .send({
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        startDate: '2025-03-07',
        endDate: '2025-03-08',
        daysRequested: 1,
      });
    expect(create.status).toBe(202);

    await sleep(8200);

    const req = await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: create.body.requestId });
    const outbox = await ds.getRepository(Outbox).findOneByOrFail({ requestId: create.body.requestId });
    const bal = await ds.getRepository(Balance).findOneByOrFail({
      employeeId: 'emp-timeout-1',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });

    expect(['SUBMITTED', 'PENDING_HCM']).toContain(req.state);
    expect(['PENDING', 'PROCESSING']).toContain(outbox.status);
    expect(outbox.attempts).toBe(1);
    expect(bal.pendingDays).toBe(1);
  });

  it('third timeout attempt moves request to FAILED and restores pending', async () => {
    const now = new Date().toISOString();
    await hcm.setBalance('emp-timeout-2', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 0, hcmLastUpdatedAt: now });
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-timeout-2',
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
    const requestId = randomUUID();
    await ds.getRepository(TimeOffRequest).insert({
      id: requestId,
      idempotencyKey: randomUUID(),
      employeeId: 'emp-timeout-2',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      startDate: '2025-03-07',
      endDate: '2025-03-08',
      daysRequested: 1,
      state: 'PENDING_HCM' as any,
      lastOutboxEvent: 'HCM_DEDUCT' as any,
      hcmExternalRef: requestId,
      hcmTransactionId: null,
      hcmResponseCode: null,
      hcmResponseBody: null,
      rejectionReason: null,
      failureReason: null,
      retryCount: 2,
      createdBy: 'emp-timeout-2',
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    await ds.getRepository(Outbox).insert({
      id: randomUUID(),
      eventType: 'HCM_DEDUCT' as any,
      payload: JSON.stringify({
        externalRef: requestId,
        employeeId: 'emp-timeout-2',
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        daysRequested: 1,
        startDate: '2025-03-07',
        endDate: '2025-03-08',
      }),
      requestId,
      status: 'PENDING',
      attempts: 2,
      lastAttemptedAt: null,
      lastError: null,
      createdAt: now,
      processAfter: now,
    });
    await hcm.setNextCallBehavior('deduct', 'timeout', 1);

    await waitForRequestState(ds, requestId, 'FAILED', 20000);

    const outbox = await ds.getRepository(Outbox).findOneByOrFail({ requestId });
    const bal = await ds.getRepository(Balance).findOneByOrFail({
      employeeId: 'emp-timeout-2',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    expect(outbox.status).toBe('FAILED');
    expect(outbox.attempts).toBe(3);
    expect(bal.pendingDays).toBe(0);
    expect(bal.usedDays).toBe(0);
  });

  it('timeout recovery before third attempt reaches APPROVED', async () => {
    const now = new Date().toISOString();
    await hcm.setBalance('emp-timeout-3', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 0, hcmLastUpdatedAt: now });
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-timeout-3',
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
    await hcm.setNextCallBehavior('deduct', 'timeout', 2);

    const create = await request(app.getHttpServer())
      .post('/time-off/requests')
      .set('X-Employee-Id', 'emp-timeout-3')
      .set('Idempotency-Key', randomUUID())
      .send({
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        startDate: '2025-03-07',
        endDate: '2025-03-08',
        daysRequested: 1,
      });
    expect(create.status).toBe(202);

    await waitForRequestState(ds, create.body.requestId, 'APPROVED', 45000);
    const bal = await ds.getRepository(Balance).findOneByOrFail({
      employeeId: 'emp-timeout-3',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    expect(bal.pendingDays).toBe(0);
    expect(bal.usedDays).toBe(1);
  });
});
