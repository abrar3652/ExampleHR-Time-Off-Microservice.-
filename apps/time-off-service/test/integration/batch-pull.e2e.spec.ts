import { INestApplication } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { LeaveType } from '../../src/domain/enums';
import { Balance } from '../../src/modules/balance/entities/balance.entity';
import { HcmClient } from '../../src/modules/hcm-client/hcm-client.service';
import { BatchPullWorker } from '../../src/modules/sync/batch-pull.worker';
import { SyncCheckpoint } from '../../src/modules/sync/entities/sync-checkpoint.entity';
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
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', DB_PATH: `./hcm-batch-pull-${port}.sqlite` },
    shell: true,
    stdio: 'ignore',
  });
}

describe('batch-pull.e2e', () => {
  const hcmBaseUrl = 'http://localhost:4000';
  let hcmProc: ChildProcess | null = null;
  let app: INestApplication;
  let ds: DataSource;
  let worker: BatchPullWorker;
  let hcm: HcmMockControl;
  let lastGeneratedAt: string | null = null;

  beforeAll(async () => {
    try {
      await waitForHcm(hcmBaseUrl, 2000);
    } catch {
      hcmProc = startHcmMock(4000);
      await waitForHcm(hcmBaseUrl, 30000);
    }
  });

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    process.env.HCM_BASE_URL = hcmBaseUrl;
    process.env.DISABLE_BACKGROUND_WORKERS = '1';

    const client: HcmClient = {
      axios: axios.create({ baseURL: hcmBaseUrl }),
      callHcm: async (fn: any) => {
        let timeoutHandle: NodeJS.Timeout | null = null;
        try {
          const res = await Promise.race([
            fn(),
            new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(() => reject(new Error('HCM_TIMEOUT')), 8000);
            }),
          ]);
          const generatedAt = (res?.data as { generatedAt?: string } | undefined)?.generatedAt;
          if (generatedAt) lastGeneratedAt = generatedAt;
          return { success: true, data: res.data, statusCode: res.status };
        } catch (err: any) {
          if (err.message === 'HCM_TIMEOUT') return { success: false, reason: 'TIMEOUT' as const };
          if (err.response) {
            const { status, data } = err.response;
            return {
              success: false,
              reason: (status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR') as 'SERVER_ERROR' | 'CLIENT_ERROR',
              statusCode: status,
              body: data,
            };
          }
          return { success: false, reason: 'NETWORK_ERROR' as const };
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        }
      },
    } as unknown as HcmClient;

    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HcmClient)
      .useValue(client)
      .compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    worker = app.get(BatchPullWorker);
    hcm = new HcmMockControl(hcmBaseUrl);
    lastGeneratedAt = null;

    await hcm.reset();
    await ds.getRepository(SyncCheckpoint).delete({ id: 'singleton' });
    await ds.getRepository(Balance).clear();
  });

  afterEach(async () => {
    await hcm.reset();
    delete process.env.DISABLE_BACKGROUND_WORKERS;
    await app.close();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (hcmProc?.pid) hcmProc.kill('SIGTERM');
  });

  it('batch pull worker fetches from HCM and applies records', async () => {
    const ts = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await hcm.setBalance('emp-b1', 'loc-nyc', 'ANNUAL', { totalDays: 20, usedDays: 1, hcmLastUpdatedAt: ts });
    await hcm.setBalance('emp-b2', 'loc-nyc', 'ANNUAL', { totalDays: 15, usedDays: 2, hcmLastUpdatedAt: ts });
    await hcm.setBalance('emp-b3', 'loc-nyc', 'ANNUAL', { totalDays: 10, usedDays: 3, hcmLastUpdatedAt: ts });

    await worker.runBatchPull(true);

    const applied = await ds.getRepository(Balance).count({
      where: [
        { employeeId: 'emp-b1', locationId: 'loc-nyc', leaveType: LeaveType.ANNUAL },
        { employeeId: 'emp-b2', locationId: 'loc-nyc', leaveType: LeaveType.ANNUAL },
        { employeeId: 'emp-b3', locationId: 'loc-nyc', leaveType: LeaveType.ANNUAL },
      ],
    });
    expect(applied).toBe(3);
    const checkpoint = await ds.getRepository(SyncCheckpoint).findOneByOrFail({ id: 'singleton' });
    expect(checkpoint.lastBatchAt).toBe(lastGeneratedAt);
  });

  it('batch pull skips records older than local hcm_last_updated_at (R6)', async () => {
    const now = new Date().toISOString();
    await ds.getRepository(Balance).insert({
      id: randomUUID(),
      employeeId: 'emp-skip',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      totalDays: 20,
      usedDays: 1,
      pendingDays: 0,
      hcmLastUpdatedAt: now,
      syncedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await hcm.setBalance('emp-skip', 'loc-nyc', 'ANNUAL', {
      totalDays: 25,
      usedDays: 4,
      hcmLastUpdatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });

    await worker.runBatchPull(true);

    const row = await ds.getRepository(Balance).findOneByOrFail({
      employeeId: 'emp-skip',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    expect(row.totalDays).toBe(20);
    expect(row.usedDays).toBe(1);
  });

  it('batch pull fails gracefully when HCM is down', async () => {
    await hcm.setNextCallBehavior('batch_get', '500', -1);

    await expect(worker.runBatchPull(true)).resolves.toBeUndefined();
    const checkpoint = await ds.getRepository(SyncCheckpoint).findOneBy({ id: 'singleton' });
    expect(checkpoint).toBeNull();
  });
});
