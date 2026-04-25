import { INestApplication } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { LeaveType } from '../../src/domain/enums';
import { Balance } from '../../src/modules/balance/entities/balance.entity';
import { ReconciliationWorker } from '../../src/modules/sync/reconciliation.worker';
import { ReconciliationLog } from '../../src/modules/sync/entities/reconciliation-log.entity';
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
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', DB_PATH: `./hcm-recon-${port}.sqlite` },
    shell: true,
    stdio: 'ignore',
  });
}

describe('reconciliation.e2e', () => {
  const hcmBaseUrl = 'http://localhost:4000';
  let hcmProc: ChildProcess | null = null;
  let app: INestApplication;
  let ds: DataSource;
  let worker: ReconciliationWorker;
  let hcm: HcmMockControl;

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
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    worker = app.get(ReconciliationWorker);
    hcm = new HcmMockControl(hcmBaseUrl);

    await hcm.reset();
    await ds.getRepository(ReconciliationLog).clear();
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

  it('detects total_days drift and logs to reconciliation_log', async () => {
    const now = Date.now();
    const staleSync = new Date(now - 20 * 60 * 1000).toISOString();
    const localHcmTs = new Date(now - 30 * 60 * 1000).toISOString();
    const hcmNow = new Date(now).toISOString();

    await hcm.setBalance('emp-001', 'loc-nyc', 'ANNUAL', {
      totalDays: 25,
      usedDays: 0,
      hcmLastUpdatedAt: hcmNow,
    });
    await ds.getRepository(Balance).insert({
      id: randomUUID(),
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      totalDays: 20,
      usedDays: 0,
      pendingDays: 0,
      hcmLastUpdatedAt: localHcmTs,
      syncedAt: staleSync,
      createdAt: staleSync,
      updatedAt: staleSync,
    });

    await worker.runReconciliation(true);

    const log = await ds.getRepository(ReconciliationLog).findOneByOrFail({
      employeeId: 'emp-001',
      driftField: 'total_days',
    });
    expect(log.drift).toBe(5);
    expect(log.resolved).toBe(1);
    const bal = await ds.getRepository(Balance).findOneByOrFail({
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    expect(bal.totalDays).toBe(25);
  });

  it('detects used_days drift (FS-3 silent success) and marks MANUAL_REVIEW', async () => {
    const now = new Date().toISOString();
    await hcm.setBalance('emp-001', 'loc-nyc', 'ANNUAL', {
      totalDays: 20,
      usedDays: 0,
      hcmLastUpdatedAt: now,
    });
    const hcmBalanceRes = await fetch(`${hcmBaseUrl}/api/hcm/balance/emp-001/loc-nyc/ANNUAL`);
    expect(hcmBalanceRes.ok).toBe(true);
    const hcmBalance = (await hcmBalanceRes.json()) as { usedDays: number };
    expect(hcmBalance.usedDays).toBe(0);
    await ds.getRepository(Balance).insert({
      id: randomUUID(),
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      totalDays: 20,
      usedDays: 3,
      pendingDays: 0,
      hcmLastUpdatedAt: now,
      syncedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      createdAt: now,
      updatedAt: now,
    });

    await worker.runReconciliation(true);

    const log = await ds.getRepository(ReconciliationLog).findOneByOrFail({
      employeeId: 'emp-001',
      driftField: 'used_days',
    });
    expect(log.drift).toBe(-3);
    expect(log.resolved).toBe(0);
    expect(log.resolution).toBe('MANUAL_REVIEW');
    const bal = await ds.getRepository(Balance).findOneByOrFail({
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    expect(bal.usedDays).toBe(3);
  });

  it('skips record when HCM fetch fails', async () => {
    const now = new Date().toISOString();
    await hcm.setBalance('emp-err', 'loc-nyc', 'ANNUAL', {
      totalDays: 20,
      usedDays: 0,
      hcmLastUpdatedAt: now,
    });
    await ds.getRepository(Balance).insert({
      id: randomUUID(),
      employeeId: 'emp-err',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      totalDays: 20,
      usedDays: 0,
      pendingDays: 0,
      hcmLastUpdatedAt: now,
      syncedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await hcm.setNextCallBehavior('balance_get', '500', 1);

    await expect(worker.runReconciliation(true)).resolves.toBeUndefined();

    const logs = await ds.getRepository(ReconciliationLog).findBy({ employeeId: 'emp-err' });
    expect(logs).toHaveLength(0);
  });

  it('does NOT auto-correct when drift is recent (< 15 minutes old)', async () => {
    const now = Date.now();
    const freshSync = new Date(now - 5 * 60 * 1000).toISOString();
    const localHcmTs = new Date(now - 20 * 60 * 1000).toISOString();
    const hcmNow = new Date(now).toISOString();

    await hcm.setBalance('emp-fresh', 'loc-nyc', 'ANNUAL', {
      totalDays: 25,
      usedDays: 0,
      hcmLastUpdatedAt: hcmNow,
    });
    await ds.getRepository(Balance).insert({
      id: randomUUID(),
      employeeId: 'emp-fresh',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      totalDays: 20,
      usedDays: 0,
      pendingDays: 0,
      hcmLastUpdatedAt: localHcmTs,
      syncedAt: freshSync,
      createdAt: freshSync,
      updatedAt: freshSync,
    });

    await worker.runReconciliation(true);

    const log = await ds.getRepository(ReconciliationLog).findOneByOrFail({
      employeeId: 'emp-fresh',
      driftField: 'total_days',
    });
    expect(log.resolved).toBe(0);
    expect(log.resolution).toBe('MANUAL_REVIEW');
    const bal = await ds.getRepository(Balance).findOneByOrFail({
      employeeId: 'emp-fresh',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    expect(bal.totalDays).toBe(20);
  });
});
