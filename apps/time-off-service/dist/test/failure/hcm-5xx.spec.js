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
async function waitForRequestState(ds, id, state, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const row = await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneBy({ id });
        if (row?.state === state)
            return;
        await sleep(250);
    }
    throw new Error(`Timed out waiting for request state ${state}`);
}
function startHcmMock(port) {
    return (0, node_child_process_1.spawn)('npm', ['run', 'start:dev'], {
        cwd: (0, node_path_1.resolve)(__dirname, '../../../..', 'apps/hcm-mock'),
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'test',
            DB_PATH: `./hcm-5xx-${port}.sqlite`,
        },
        shell: true,
        stdio: 'ignore',
    });
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
describe('hcm-5xx.spec (FS-2)', () => {
    jest.setTimeout(120000);
    const hcmPort = 4102;
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
        if (hcm)
            await hcm.reset();
        if (app)
            await app.close();
    });
    afterAll(async () => {
        if (hcmProc?.pid)
            hcmProc.kill('SIGTERM');
    });
    it('HCM 500 retries 3 times then fails and restores pending', async () => {
        const now = new Date().toISOString();
        await hcm.setBalance('emp-5xx-1', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 0, hcmLastUpdatedAt: now });
        await ds.getRepository(balance_entity_1.Balance).upsert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-5xx-1',
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
        await hcm.setNextCallBehavior('deduct', '500', 3);
        const create = await (0, supertest_1.default)(app.getHttpServer())
            .post('/time-off/requests')
            .set('X-Employee-Id', 'emp-5xx-1')
            .set('Idempotency-Key', (0, node_crypto_1.randomUUID)())
            .send({
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            startDate: '2025-03-07',
            endDate: '2025-03-08',
            daysRequested: 1,
        });
        expect(create.status).toBe(202);
        await waitForRequestState(ds, create.body.requestId, 'FAILED', 25000);
        const req = await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: create.body.requestId });
        const outbox = await ds.getRepository(outbox_entity_1.Outbox).findOneByOrFail({ requestId: create.body.requestId });
        const bal = await ds.getRepository(balance_entity_1.Balance).findOneByOrFail({
            employeeId: 'emp-5xx-1',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
        });
        expect(req.state).toBe('FAILED');
        expect(outbox.attempts).toBe(3);
        expect(outbox.status).toBe('FAILED');
        expect(bal.pendingDays).toBe(0);
        expect(bal.usedDays).toBe(0);
        const calls = await hcm.getCallLog();
        const deductCalls = calls.filter((c) => c.endpoint === 'deduct');
        expect(deductCalls.length).toBeGreaterThanOrEqual(3);
    });
});
//# sourceMappingURL=hcm-5xx.spec.js.map