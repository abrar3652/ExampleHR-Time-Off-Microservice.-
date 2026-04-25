import { INestApplication } from '@nestjs/common';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
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

function startHcmMock(port: number): ChildProcess {
  return spawn('npm', ['run', 'start:dev'], {
    cwd: resolve(__dirname, '../../../..', 'apps/hcm-mock'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DB_PATH: `./hcm-netcut-${port}.sqlite`,
    },
    shell: true,
    stdio: 'ignore',
  });
}

function stopHcmMock(proc: ChildProcess, port: number): void {
  if (!proc.pid) return;
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`).toString();
      const lines = output
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.includes('LISTENING'));
      for (const line of lines) {
        const parts = line.split(/\s+/);
        const pid = parts[parts.length - 1];
        execSync(`taskkill /PID ${pid} /F`);
      }
      return;
    }
    proc.kill('SIGTERM');
  } catch {}
}

function makeHcmClient(baseURL: string): HcmClient {
  const http = axios.create({ baseURL });
  return {
    axios: http,
    callHcm: async (fn: any) => {
      let timeoutHandle: NodeJS.Timeout | null = null;
      try {
        const response = await Promise.race([
          fn(),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('HCM_TIMEOUT')), 8000);
          }),
        ]);
        return { success: true, data: response.data, statusCode: response.status };
      } catch (err: any) {
        if (err.message === 'HCM_TIMEOUT') return { success: false, reason: 'TIMEOUT' };
        if (err.response) {
          const { status, data } = err.response;
          return { success: false, reason: status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR', statusCode: status, body: data };
        }
        return { success: false, reason: 'NETWORK_ERROR' };
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    },
  } as unknown as HcmClient;
}

describe('hcm-network-cut.spec (FS-9)', () => {
  jest.setTimeout(120000);

  const hcmPort = 4103;
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
    if (hcmProc?.exitCode !== null) {
      hcmProc = startHcmMock(hcmPort);
      await waitForHcm(hcmBaseUrl, 30000);
      hcm = new HcmMockControl(hcmBaseUrl);
    }
    if (hcm) {
      try {
        await hcm.reset();
      } catch {
        hcmProc = startHcmMock(hcmPort);
        await waitForHcm(hcmBaseUrl, 30000);
        hcm = new HcmMockControl(hcmBaseUrl);
        await hcm.reset();
      }
    }
    if (app) await app.close();
  });

  afterAll(async () => {
    if (hcmProc?.pid && hcmProc.exitCode === null) hcmProc.kill('SIGTERM');
  });

  it('network cut during deduct acts like retryable failure', async () => {
    const now = new Date().toISOString();
    await hcm.setBalance('emp-net-1', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 0, hcmLastUpdatedAt: now });
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-net-1',
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

    stopHcmMock(hcmProc, hcmPort);
    await sleep(500);

    const create = await request(app.getHttpServer())
      .post('/time-off/requests')
      .set('X-Employee-Id', 'emp-net-1')
      .set('Idempotency-Key', randomUUID())
      .send({
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        startDate: '2025-03-07',
        endDate: '2025-03-08',
        daysRequested: 1,
      });
    expect(create.status).toBe(202);

    await sleep(1500);
    const req = await ds.getRepository(TimeOffRequest).findOneByOrFail({ id: create.body.requestId });
    const outbox = await ds.getRepository(Outbox).findOneByOrFail({ requestId: create.body.requestId });
    expect(req.state).toBe('PENDING_HCM');
    expect(outbox.status).toBe('PENDING');
    expect(outbox.attempts).toBe(1);
  });

  it('balance read stale cache with network cut returns 503', async () => {
    const staleSynced = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-net-2',
        locationId: 'loc-nyc',
        leaveType: LeaveType.ANNUAL,
        totalDays: 7,
        usedDays: 1,
        pendingDays: 0,
        hcmLastUpdatedAt: staleSynced,
        syncedAt: staleSynced,
        createdAt: staleSynced,
        updatedAt: staleSynced,
      },
      ['employeeId', 'locationId', 'leaveType'],
    );

    stopHcmMock(hcmProc, hcmPort);
    await sleep(500);

    const res = await request(app.getHttpServer()).get('/balances/emp-net-2/loc-nyc/ANNUAL');
    expect(res.status).toBe(503);
  });

  it('balance read fresh cache with network cut returns cached 200', async () => {
    const now = new Date().toISOString();
    await ds.getRepository(Balance).upsert(
      {
        id: randomUUID(),
        employeeId: 'emp-net-3',
        locationId: 'loc-nyc',
        leaveType: LeaveType.ANNUAL,
        totalDays: 8,
        usedDays: 2,
        pendingDays: 0,
        hcmLastUpdatedAt: now,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      ['employeeId', 'locationId', 'leaveType'],
    );

    stopHcmMock(hcmProc, hcmPort);
    await sleep(500);

    const res = await request(app.getHttpServer()).get('/balances/emp-net-3/loc-nyc/ANNUAL');
    expect(res.status).toBe(200);
    expect(res.body.totalDays).toBe(8);
    expect(res.body.usedDays).toBe(2);
  });
});
