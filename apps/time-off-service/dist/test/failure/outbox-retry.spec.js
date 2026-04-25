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
            DB_PATH: `./hcm-outbox-retry-${port}.sqlite`,
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
describe('outbox-retry.spec', () => {
    jest.setTimeout(120000);
    const hcmPort = 4104;
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
    it('PROCESSING records older than 30s are re-queued and processed', async () => {
        const now = new Date().toISOString();
        await hcm.setBalance('emp-retry-1', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 0, hcmLastUpdatedAt: now });
        await ds.getRepository(balance_entity_1.Balance).upsert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-retry-1',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            totalDays: 5,
            usedDays: 0,
            pendingDays: 1,
            hcmLastUpdatedAt: now,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
        }, ['employeeId', 'locationId', 'leaveType']);
        const reqId = (0, node_crypto_1.randomUUID)();
        await ds.getRepository(time_off_request_entity_1.TimeOffRequest).insert({
            id: reqId,
            idempotencyKey: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-retry-1',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            startDate: '2025-03-07',
            endDate: '2025-03-08',
            daysRequested: 1,
            state: enums_1.RequestState.PENDING_HCM,
            lastOutboxEvent: enums_1.OutboxEventType.HCM_DEDUCT,
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
        await ds.getRepository(outbox_entity_1.Outbox).insert({
            id: (0, node_crypto_1.randomUUID)(),
            eventType: enums_1.OutboxEventType.HCM_DEDUCT,
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
        const outbox = await ds.getRepository(outbox_entity_1.Outbox).findOneByOrFail({ requestId: reqId });
        const req = await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: reqId });
        expect(outbox.status).toBe('DONE');
        expect(req.state).toBe('APPROVED');
    });
    it('safety guard marks record FAILED when attempts exceed max', async () => {
        const now = new Date().toISOString();
        await hcm.setBalance('emp-retry-2', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 0, hcmLastUpdatedAt: now });
        await ds.getRepository(balance_entity_1.Balance).upsert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-retry-2',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            totalDays: 5,
            usedDays: 0,
            pendingDays: 1,
            hcmLastUpdatedAt: now,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
        }, ['employeeId', 'locationId', 'leaveType']);
        const requestId = (0, node_crypto_1.randomUUID)();
        await ds.getRepository(time_off_request_entity_1.TimeOffRequest).insert({
            id: requestId,
            idempotencyKey: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-retry-2',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            startDate: '2025-03-07',
            endDate: '2025-03-08',
            daysRequested: 1,
            state: enums_1.RequestState.PENDING_HCM,
            lastOutboxEvent: enums_1.OutboxEventType.HCM_DEDUCT,
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
        await ds.getRepository(outbox_entity_1.Outbox).insert({
            id: (0, node_crypto_1.randomUUID)(),
            eventType: enums_1.OutboxEventType.HCM_DEDUCT,
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
        const outbox = await ds.getRepository(outbox_entity_1.Outbox).findOneByOrFail({ requestId });
        const requestRow = await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: requestId });
        expect(outbox.status).toBe('FAILED');
        expect(outbox.lastError).toBe('SAFETY_GUARD_EXCEEDED');
        expect(requestRow.state).toBe(enums_1.RequestState.FAILED);
    });
    it('reverse client error marks FAILED with REVERSAL_REJECTED', async () => {
        const now = new Date().toISOString();
        await hcm.setBalance('emp-retry-3', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 1, hcmLastUpdatedAt: now });
        await ds.getRepository(balance_entity_1.Balance).upsert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-retry-3',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            totalDays: 5,
            usedDays: 1,
            pendingDays: 0,
            hcmLastUpdatedAt: now,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
        }, ['employeeId', 'locationId', 'leaveType']);
        const requestId = (0, node_crypto_1.randomUUID)();
        await ds.getRepository(time_off_request_entity_1.TimeOffRequest).insert({
            id: requestId,
            idempotencyKey: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-retry-3',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            startDate: '2025-03-07',
            endDate: '2025-03-08',
            daysRequested: 1,
            state: enums_1.RequestState.CANCELLING,
            lastOutboxEvent: enums_1.OutboxEventType.HCM_REVERSE,
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
        await ds.getRepository(outbox_entity_1.Outbox).insert({
            id: (0, node_crypto_1.randomUUID)(),
            eventType: enums_1.OutboxEventType.HCM_REVERSE,
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
        const outbox = await ds.getRepository(outbox_entity_1.Outbox).findOneByOrFail({ requestId });
        const requestRow = await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: requestId });
        expect(outbox.status).toBe('FAILED');
        expect(outbox.lastError).toBe('REVERSAL_REJECTED');
        expect(requestRow.state).toBe(enums_1.RequestState.FAILED);
    });
    it('reverse server error schedules retry', async () => {
        const now = new Date().toISOString();
        await hcm.setBalance('emp-retry-4', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 1, hcmLastUpdatedAt: now });
        await hcm.setNextCallBehavior('reverse', '500', 1);
        await ds.getRepository(balance_entity_1.Balance).upsert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-retry-4',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            totalDays: 5,
            usedDays: 1,
            pendingDays: 0,
            hcmLastUpdatedAt: now,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
        }, ['employeeId', 'locationId', 'leaveType']);
        const requestId = (0, node_crypto_1.randomUUID)();
        await ds.getRepository(time_off_request_entity_1.TimeOffRequest).insert({
            id: requestId,
            idempotencyKey: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-retry-4',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            startDate: '2025-03-07',
            endDate: '2025-03-08',
            daysRequested: 1,
            state: enums_1.RequestState.CANCELLING,
            lastOutboxEvent: enums_1.OutboxEventType.HCM_REVERSE,
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
        await ds.getRepository(outbox_entity_1.Outbox).insert({
            id: (0, node_crypto_1.randomUUID)(),
            eventType: enums_1.OutboxEventType.HCM_REVERSE,
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
        const outbox = await ds.getRepository(outbox_entity_1.Outbox).findOneByOrFail({ requestId });
        expect(outbox.status).toBe('PENDING');
        expect(outbox.attempts).toBe(1);
        expect(outbox.lastError).toBe('SERVER_ERROR');
    });
});
//# sourceMappingURL=outbox-retry.spec.js.map