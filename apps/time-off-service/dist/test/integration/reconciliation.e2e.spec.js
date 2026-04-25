"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("typeorm");
const app_module_1 = require("../../src/app.module");
const enums_1 = require("../../src/domain/enums");
const balance_entity_1 = require("../../src/modules/balance/entities/balance.entity");
const reconciliation_worker_1 = require("../../src/modules/sync/reconciliation.worker");
const reconciliation_log_entity_1 = require("../../src/modules/sync/entities/reconciliation-log.entity");
const hcm_mock_control_1 = require("../helpers/hcm-mock-control");
async function sleep(ms) {
    await new Promise((r) => setTimeout(r, ms));
}
async function waitForHcm(baseUrl, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const r = await fetch(`${baseUrl}/__control/call-log`);
            if (r.ok)
                return;
        }
        catch { }
        await sleep(250);
    }
    throw new Error('Timed out waiting for hcm-mock');
}
function startHcmMock(port) {
    return (0, node_child_process_1.spawn)('npm', ['run', 'start:dev'], {
        cwd: (0, node_path_1.resolve)(__dirname, '../../../..', 'apps/hcm-mock'),
        env: { ...process.env, PORT: String(port), NODE_ENV: 'test', DB_PATH: `./hcm-recon-${port}.sqlite` },
        shell: true,
        stdio: 'ignore',
    });
}
describe('reconciliation.e2e', () => {
    const hcmBaseUrl = 'http://localhost:4000';
    let hcmProc = null;
    let app;
    let ds;
    let worker;
    let hcm;
    beforeAll(async () => {
        try {
            await waitForHcm(hcmBaseUrl, 2000);
        }
        catch {
            hcmProc = startHcmMock(4000);
            await waitForHcm(hcmBaseUrl, 30000);
        }
    });
    beforeEach(async () => {
        process.env.DB_PATH = ':memory:';
        process.env.HCM_BASE_URL = hcmBaseUrl;
        process.env.DISABLE_BACKGROUND_WORKERS = '1';
        const mod = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] }).compile();
        app = mod.createNestApplication();
        await app.init();
        ds = app.get(typeorm_1.DataSource);
        worker = app.get(reconciliation_worker_1.ReconciliationWorker);
        hcm = new hcm_mock_control_1.HcmMockControl(hcmBaseUrl);
        await hcm.reset();
        await ds.getRepository(reconciliation_log_entity_1.ReconciliationLog).clear();
        await ds.getRepository(balance_entity_1.Balance).clear();
    });
    afterEach(async () => {
        await hcm.reset();
        delete process.env.DISABLE_BACKGROUND_WORKERS;
        await app.close();
    });
    afterAll(async () => {
        if (app)
            await app.close();
        if (hcmProc?.pid)
            hcmProc.kill('SIGTERM');
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
        await ds.getRepository(balance_entity_1.Balance).insert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            totalDays: 20,
            usedDays: 0,
            pendingDays: 0,
            hcmLastUpdatedAt: localHcmTs,
            syncedAt: staleSync,
            createdAt: staleSync,
            updatedAt: staleSync,
        });
        await worker.runReconciliation(true);
        const log = await ds.getRepository(reconciliation_log_entity_1.ReconciliationLog).findOneByOrFail({
            employeeId: 'emp-001',
            driftField: 'total_days',
        });
        expect(log.drift).toBe(5);
        expect(log.resolved).toBe(1);
        const bal = await ds.getRepository(balance_entity_1.Balance).findOneByOrFail({
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
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
        const hcmBalance = (await hcmBalanceRes.json());
        expect(hcmBalance.usedDays).toBe(0);
        await ds.getRepository(balance_entity_1.Balance).insert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            totalDays: 20,
            usedDays: 3,
            pendingDays: 0,
            hcmLastUpdatedAt: now,
            syncedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
            createdAt: now,
            updatedAt: now,
        });
        await worker.runReconciliation(true);
        const log = await ds.getRepository(reconciliation_log_entity_1.ReconciliationLog).findOneByOrFail({
            employeeId: 'emp-001',
            driftField: 'used_days',
        });
        expect(log.drift).toBe(-3);
        expect(log.resolved).toBe(0);
        expect(log.resolution).toBe('MANUAL_REVIEW');
        const bal = await ds.getRepository(balance_entity_1.Balance).findOneByOrFail({
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
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
        await ds.getRepository(balance_entity_1.Balance).insert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-err',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
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
        const logs = await ds.getRepository(reconciliation_log_entity_1.ReconciliationLog).findBy({ employeeId: 'emp-err' });
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
        await ds.getRepository(balance_entity_1.Balance).insert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-fresh',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            totalDays: 20,
            usedDays: 0,
            pendingDays: 0,
            hcmLastUpdatedAt: localHcmTs,
            syncedAt: freshSync,
            createdAt: freshSync,
            updatedAt: freshSync,
        });
        await worker.runReconciliation(true);
        const log = await ds.getRepository(reconciliation_log_entity_1.ReconciliationLog).findOneByOrFail({
            employeeId: 'emp-fresh',
            driftField: 'total_days',
        });
        expect(log.resolved).toBe(0);
        expect(log.resolution).toBe('MANUAL_REVIEW');
        const bal = await ds.getRepository(balance_entity_1.Balance).findOneByOrFail({
            employeeId: 'emp-fresh',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
        });
        expect(bal.totalDays).toBe(20);
    });
});
//# sourceMappingURL=reconciliation.e2e.spec.js.map