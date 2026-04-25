"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("typeorm");
const supertest_1 = __importDefault(require("supertest"));
const app_module_1 = require("../../src/app.module");
const enums_1 = require("../../src/domain/enums");
const balance_entity_1 = require("../../src/modules/balance/entities/balance.entity");
const hcm_deduction_writer_service_1 = require("../../src/modules/hcm-client/hcm-deduction-writer.service");
const outbox_entity_1 = require("../../src/modules/time-off/entities/outbox.entity");
const time_off_request_entity_1 = require("../../src/modules/time-off/entities/time-off-request.entity");
class MockWriter {
    async deduct(payload) {
        return {
            success: true,
            statusCode: 200,
            data: {
                hcmTransactionId: `txn-${payload.externalRef}`,
                newTotalDays: 20,
                newUsedDays: 8,
                lastUpdatedAt: new Date().toISOString(),
            },
        };
    }
    async reverse() {
        return {
            success: true,
            statusCode: 200,
            data: { hcmTransactionId: 'rev-1', newTotalDays: 20, newUsedDays: 5, lastUpdatedAt: new Date().toISOString() },
        };
    }
}
async function waitFor(predicate, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await predicate())
            return;
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error('Timed out waiting for condition');
}
describe('cancellation.e2e', () => {
    let app;
    let ds;
    beforeEach(async () => {
        process.env.DB_PATH = ':memory:';
        const mod = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] })
            .overrideProvider(hcm_deduction_writer_service_1.HcmDeductionWriter)
            .useValue(new MockWriter())
            .compile();
        app = mod.createNestApplication();
        await app.init();
        ds = app.get(typeorm_1.DataSource);
        const now = new Date().toISOString();
        await ds.getRepository(balance_entity_1.Balance).delete({
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
        });
        await ds.getRepository(balance_entity_1.Balance).insert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            totalDays: 20,
            usedDays: 5,
            pendingDays: 0,
            hcmLastUpdatedAt: now,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
        });
    });
    afterEach(async () => {
        await app.close();
    });
    afterAll(async () => {
        if (app)
            await app.close();
    });
    it('Cancel SUBMITTED request -> CANCELLED and pending restored', async () => {
        const reqId = (0, node_crypto_1.randomUUID)();
        const now = new Date().toISOString();
        await ds.getRepository(time_off_request_entity_1.TimeOffRequest).insert({
            id: reqId,
            idempotencyKey: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            startDate: '2025-02-10',
            endDate: '2025-02-12',
            daysRequested: 3,
            state: enums_1.RequestState.SUBMITTED,
            lastOutboxEvent: enums_1.OutboxEventType.HCM_DEDUCT,
            hcmExternalRef: reqId,
            hcmTransactionId: null,
            hcmResponseCode: null,
            hcmResponseBody: null,
            rejectionReason: null,
            failureReason: null,
            retryCount: 0,
            createdBy: 'emp-001',
            approvedBy: null,
            createdAt: now,
            updatedAt: now,
        });
        await ds
            .getRepository(balance_entity_1.Balance)
            .update({ employeeId: 'emp-001', locationId: 'loc-nyc', leaveType: enums_1.LeaveType.ANNUAL }, { pendingDays: 3, updatedAt: now });
        const cancel = await (0, supertest_1.default)(app.getHttpServer())
            .post(`/time-off/requests/${reqId}/cancel`)
            .set('X-Employee-Id', 'emp-001')
            .set('Idempotency-Key', (0, node_crypto_1.randomUUID)())
            .send({});
        expect(cancel.status).toBe(200);
        expect(cancel.body.state).toBe('CANCELLED');
        const req = await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: reqId });
        expect(req.state).toBe(enums_1.RequestState.CANCELLED);
    });
    it('Cancel APPROVED request -> reversal outbox then CANCELLED', async () => {
        const create = await (0, supertest_1.default)(app.getHttpServer())
            .post('/time-off/requests')
            .set('X-Employee-Id', 'emp-001')
            .set('Idempotency-Key', (0, node_crypto_1.randomUUID)())
            .send({
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            startDate: '2025-02-10',
            endDate: '2025-02-12',
            daysRequested: 3,
        });
        expect(create.status).toBe(202);
        await waitFor(async () => {
            const req = await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneBy({ id: create.body.requestId });
            return req?.state === enums_1.RequestState.APPROVED;
        }, 4000);
        const cancel = await (0, supertest_1.default)(app.getHttpServer())
            .post(`/time-off/requests/${create.body.requestId}/cancel`)
            .set('X-Employee-Id', 'emp-001')
            .set('Idempotency-Key', (0, node_crypto_1.randomUUID)())
            .send({});
        expect(cancel.status).toBe(200);
        const outbox = await ds.getRepository(outbox_entity_1.Outbox).findOneBy({ requestId: create.body.requestId, eventType: enums_1.OutboxEventType.HCM_REVERSE });
        expect(outbox).toBeTruthy();
        await waitFor(async () => {
            const req = await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneBy({ id: create.body.requestId });
            return req?.state === enums_1.RequestState.CANCELLED;
        }, 4000);
        const bal = await ds.getRepository(balance_entity_1.Balance).findOneByOrFail({
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
        });
        expect(bal.usedDays).toBe(5);
    });
    it('Cancel REJECTED request -> 409 invalid transition', async () => {
        const reqId = (0, node_crypto_1.randomUUID)();
        const now = new Date().toISOString();
        await ds.getRepository(time_off_request_entity_1.TimeOffRequest).insert({
            id: reqId,
            idempotencyKey: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            startDate: '2025-02-10',
            endDate: '2025-02-12',
            daysRequested: 3,
            state: enums_1.RequestState.REJECTED,
            lastOutboxEvent: null,
            hcmExternalRef: reqId,
            hcmTransactionId: null,
            hcmResponseCode: null,
            hcmResponseBody: null,
            rejectionReason: 'x',
            failureReason: null,
            retryCount: 0,
            createdBy: 'emp-001',
            approvedBy: null,
            createdAt: now,
            updatedAt: now,
        });
        const cancel = await (0, supertest_1.default)(app.getHttpServer())
            .post(`/time-off/requests/${reqId}/cancel`)
            .set('X-Employee-Id', 'emp-001')
            .set('Idempotency-Key', (0, node_crypto_1.randomUUID)())
            .send({});
        expect(cancel.status).toBe(409);
    });
    it('Cancel CANCELLED request -> 409 invalid transition', async () => {
        const reqId = (0, node_crypto_1.randomUUID)();
        const now = new Date().toISOString();
        await ds.getRepository(time_off_request_entity_1.TimeOffRequest).insert({
            id: reqId,
            idempotencyKey: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            startDate: '2025-02-10',
            endDate: '2025-02-12',
            daysRequested: 3,
            state: enums_1.RequestState.CANCELLED,
            lastOutboxEvent: null,
            hcmExternalRef: reqId,
            hcmTransactionId: null,
            hcmResponseCode: null,
            hcmResponseBody: null,
            rejectionReason: null,
            failureReason: null,
            retryCount: 0,
            createdBy: 'emp-001',
            approvedBy: null,
            createdAt: now,
            updatedAt: now,
        });
        const cancel = await (0, supertest_1.default)(app.getHttpServer())
            .post(`/time-off/requests/${reqId}/cancel`)
            .set('X-Employee-Id', 'emp-001')
            .set('Idempotency-Key', (0, node_crypto_1.randomUUID)())
            .send({});
        expect(cancel.status).toBe(409);
    });
});
//# sourceMappingURL=cancellation.e2e.spec.js.map