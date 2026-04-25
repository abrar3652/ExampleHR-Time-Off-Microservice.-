"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const testing_1 = require("@nestjs/testing");
const axios_1 = __importDefault(require("axios"));
const typeorm_1 = require("typeorm");
const app_module_1 = require("../../src/app.module");
const enums_1 = require("../../src/domain/enums");
const balance_entity_1 = require("../../src/modules/balance/entities/balance.entity");
const hcm_client_service_1 = require("../../src/modules/hcm-client/hcm-client.service");
const batch_pull_worker_1 = require("../../src/modules/sync/batch-pull.worker");
const sync_checkpoint_entity_1 = require("../../src/modules/sync/entities/sync-checkpoint.entity");
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
        env: { ...process.env, PORT: String(port), NODE_ENV: 'test', DB_PATH: `./hcm-batch-pull-${port}.sqlite` },
        shell: true,
        stdio: 'ignore',
    });
}
describe('batch-pull.e2e', () => {
    const hcmBaseUrl = 'http://localhost:4000';
    let hcmProc = null;
    let app;
    let ds;
    let worker;
    let hcm;
    let lastGeneratedAt = null;
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
        const client = {
            axios: axios_1.default.create({ baseURL: hcmBaseUrl }),
            callHcm: async (fn) => {
                let timeoutHandle = null;
                try {
                    const res = await Promise.race([
                        fn(),
                        new Promise((_, reject) => {
                            timeoutHandle = setTimeout(() => reject(new Error('HCM_TIMEOUT')), 8000);
                        }),
                    ]);
                    const generatedAt = res?.data?.generatedAt;
                    if (generatedAt)
                        lastGeneratedAt = generatedAt;
                    return { success: true, data: res.data, statusCode: res.status };
                }
                catch (err) {
                    if (err.message === 'HCM_TIMEOUT')
                        return { success: false, reason: 'TIMEOUT' };
                    if (err.response) {
                        const { status, data } = err.response;
                        return {
                            success: false,
                            reason: (status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR'),
                            statusCode: status,
                            body: data,
                        };
                    }
                    return { success: false, reason: 'NETWORK_ERROR' };
                }
                finally {
                    if (timeoutHandle)
                        clearTimeout(timeoutHandle);
                }
            },
        };
        const mod = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] })
            .overrideProvider(hcm_client_service_1.HcmClient)
            .useValue(client)
            .compile();
        app = mod.createNestApplication();
        await app.init();
        ds = app.get(typeorm_1.DataSource);
        worker = app.get(batch_pull_worker_1.BatchPullWorker);
        hcm = new hcm_mock_control_1.HcmMockControl(hcmBaseUrl);
        lastGeneratedAt = null;
        await hcm.reset();
        await ds.getRepository(sync_checkpoint_entity_1.SyncCheckpoint).delete({ id: 'singleton' });
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
    it('batch pull worker fetches from HCM and applies records', async () => {
        const ts = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        await hcm.setBalance('emp-b1', 'loc-nyc', 'ANNUAL', { totalDays: 20, usedDays: 1, hcmLastUpdatedAt: ts });
        await hcm.setBalance('emp-b2', 'loc-nyc', 'ANNUAL', { totalDays: 15, usedDays: 2, hcmLastUpdatedAt: ts });
        await hcm.setBalance('emp-b3', 'loc-nyc', 'ANNUAL', { totalDays: 10, usedDays: 3, hcmLastUpdatedAt: ts });
        await worker.runBatchPull(true);
        const applied = await ds.getRepository(balance_entity_1.Balance).count({
            where: [
                { employeeId: 'emp-b1', locationId: 'loc-nyc', leaveType: enums_1.LeaveType.ANNUAL },
                { employeeId: 'emp-b2', locationId: 'loc-nyc', leaveType: enums_1.LeaveType.ANNUAL },
                { employeeId: 'emp-b3', locationId: 'loc-nyc', leaveType: enums_1.LeaveType.ANNUAL },
            ],
        });
        expect(applied).toBe(3);
        const checkpoint = await ds.getRepository(sync_checkpoint_entity_1.SyncCheckpoint).findOneByOrFail({ id: 'singleton' });
        expect(checkpoint.lastBatchAt).toBe(lastGeneratedAt);
    });
    it('batch pull skips records older than local hcm_last_updated_at (R6)', async () => {
        const now = new Date().toISOString();
        await ds.getRepository(balance_entity_1.Balance).insert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-skip',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
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
        const row = await ds.getRepository(balance_entity_1.Balance).findOneByOrFail({
            employeeId: 'emp-skip',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
        });
        expect(row.totalDays).toBe(20);
        expect(row.usedDays).toBe(1);
    });
    it('batch pull fails gracefully when HCM is down', async () => {
        await hcm.setNextCallBehavior('batch_get', '500', -1);
        await expect(worker.runBatchPull(true)).resolves.toBeUndefined();
        const checkpoint = await ds.getRepository(sync_checkpoint_entity_1.SyncCheckpoint).findOneBy({ id: 'singleton' });
        expect(checkpoint).toBeNull();
    });
});
//# sourceMappingURL=batch-pull.e2e.spec.js.map