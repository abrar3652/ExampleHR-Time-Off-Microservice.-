"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("typeorm");
const supertest_1 = __importDefault(require("supertest"));
const axios_1 = __importDefault(require("axios"));
const app_module_1 = require("../../src/app.module");
const enums_1 = require("../../src/domain/enums");
const hcm_client_service_1 = require("../../src/modules/hcm-client/hcm-client.service");
const balance_entity_1 = require("../../src/modules/balance/entities/balance.entity");
const outbox_entity_1 = require("../../src/modules/time-off/entities/outbox.entity");
const time_off_request_entity_1 = require("../../src/modules/time-off/entities/time-off-request.entity");
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
function stopHcmMock(proc, port) {
    if (!proc.pid)
        return;
    try {
        if (process.platform === 'win32') {
            const output = (0, node_child_process_1.execSync)(`netstat -ano | findstr :${port}`).toString();
            const lines = output
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l.includes('LISTENING'));
            for (const line of lines) {
                const parts = line.split(/\s+/);
                const pid = parts[parts.length - 1];
                (0, node_child_process_1.execSync)(`taskkill /PID ${pid} /F`);
            }
            return;
        }
        proc.kill('SIGTERM');
    }
    catch { }
}
function makeHcmClient(baseURL) {
    const http = axios_1.default.create({ baseURL });
    return {
        axios: http,
        callHcm: async (fn) => {
            let timeoutHandle = null;
            try {
                const response = await Promise.race([
                    fn(),
                    new Promise((_, reject) => {
                        timeoutHandle = setTimeout(() => reject(new Error('HCM_TIMEOUT')), 8000);
                    }),
                ]);
                return { success: true, data: response.data, statusCode: response.status };
            }
            catch (err) {
                if (err.message === 'HCM_TIMEOUT')
                    return { success: false, reason: 'TIMEOUT' };
                if (err.response) {
                    const { status, data } = err.response;
                    return { success: false, reason: status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR', statusCode: status, body: data };
                }
                return { success: false, reason: 'NETWORK_ERROR' };
            }
            finally {
                if (timeoutHandle)
                    clearTimeout(timeoutHandle);
            }
        },
    };
}
describe('hcm-network-cut.spec (FS-9)', () => {
    jest.setTimeout(120000);
    const hcmPort = 4103;
    const hcmBaseUrl = `http://localhost:${hcmPort}`;
    let hcmProc;
    let hcm;
    let app;
    let ds;
    beforeAll(async () => {
        hcmProc = startHcmMock(hcmPort);
        await waitForHcm(hcmBaseUrl, 30000);
    });
    beforeEach(async () => {
        process.env.DB_PATH = ':memory:';
        const mod = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] })
            .overrideProvider(hcm_client_service_1.HcmClient)
            .useValue(makeHcmClient(hcmBaseUrl))
            .compile();
        app = mod.createNestApplication();
        await app.init();
        ds = app.get(typeorm_1.DataSource);
        hcm = new hcm_mock_control_1.HcmMockControl(hcmBaseUrl);
    });
    afterEach(async () => {
        if (hcmProc?.exitCode !== null) {
            hcmProc = startHcmMock(hcmPort);
            await waitForHcm(hcmBaseUrl, 30000);
            hcm = new hcm_mock_control_1.HcmMockControl(hcmBaseUrl);
        }
        if (hcm) {
            try {
                await hcm.reset();
            }
            catch {
                hcmProc = startHcmMock(hcmPort);
                await waitForHcm(hcmBaseUrl, 30000);
                hcm = new hcm_mock_control_1.HcmMockControl(hcmBaseUrl);
                await hcm.reset();
            }
        }
        if (app)
            await app.close();
    });
    afterAll(async () => {
        if (hcmProc?.pid && hcmProc.exitCode === null)
            hcmProc.kill('SIGTERM');
    });
    it('network cut during deduct acts like retryable failure', async () => {
        const now = new Date().toISOString();
        await hcm.setBalance('emp-net-1', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 0, hcmLastUpdatedAt: now });
        await ds.getRepository(balance_entity_1.Balance).upsert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-net-1',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            totalDays: 5,
            usedDays: 0,
            pendingDays: 0,
            hcmLastUpdatedAt: now,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
        }, ['employeeId', 'locationId', 'leaveType']);
        stopHcmMock(hcmProc, hcmPort);
        await sleep(500);
        const create = await (0, supertest_1.default)(app.getHttpServer())
            .post('/time-off/requests')
            .set('X-Employee-Id', 'emp-net-1')
            .set('Idempotency-Key', (0, node_crypto_1.randomUUID)())
            .send({
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            startDate: '2025-03-07',
            endDate: '2025-03-08',
            daysRequested: 1,
        });
        expect(create.status).toBe(202);
        await sleep(1500);
        const req = await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: create.body.requestId });
        const outbox = await ds.getRepository(outbox_entity_1.Outbox).findOneByOrFail({ requestId: create.body.requestId });
        expect(req.state).toBe('PENDING_HCM');
        expect(outbox.status).toBe('PENDING');
        expect(outbox.attempts).toBe(1);
    });
    it('balance read stale cache with network cut returns 503', async () => {
        const staleSynced = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        await ds.getRepository(balance_entity_1.Balance).upsert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-net-2',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            totalDays: 7,
            usedDays: 1,
            pendingDays: 0,
            hcmLastUpdatedAt: staleSynced,
            syncedAt: staleSynced,
            createdAt: staleSynced,
            updatedAt: staleSynced,
        }, ['employeeId', 'locationId', 'leaveType']);
        stopHcmMock(hcmProc, hcmPort);
        await sleep(500);
        const res = await (0, supertest_1.default)(app.getHttpServer()).get('/balances/emp-net-2/loc-nyc/ANNUAL');
        expect(res.status).toBe(503);
    });
    it('balance read fresh cache with network cut returns cached 200', async () => {
        const now = new Date().toISOString();
        await ds.getRepository(balance_entity_1.Balance).upsert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-net-3',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            totalDays: 8,
            usedDays: 2,
            pendingDays: 0,
            hcmLastUpdatedAt: now,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
        }, ['employeeId', 'locationId', 'leaveType']);
        stopHcmMock(hcmProc, hcmPort);
        await sleep(500);
        const res = await (0, supertest_1.default)(app.getHttpServer()).get('/balances/emp-net-3/loc-nyc/ANNUAL');
        expect(res.status).toBe(200);
        expect(res.body.totalDays).toBe(8);
        expect(res.body.usedDays).toBe(2);
    });
});
//# sourceMappingURL=hcm-network-cut.spec.js.map