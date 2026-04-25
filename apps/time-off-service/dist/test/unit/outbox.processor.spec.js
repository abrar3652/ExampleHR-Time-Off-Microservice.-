"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("typeorm");
const app_module_1 = require("../../src/app.module");
const enums_1 = require("../../src/domain/enums");
const balance_entity_1 = require("../../src/modules/balance/entities/balance.entity");
const hcm_deduction_writer_service_1 = require("../../src/modules/hcm-client/hcm-deduction-writer.service");
const outbox_processor_1 = require("../../src/modules/outbox/outbox.processor");
const outbox_entity_1 = require("../../src/modules/time-off/entities/outbox.entity");
const time_off_request_entity_1 = require("../../src/modules/time-off/entities/time-off-request.entity");
class MockWriter {
    deductResult = {
        success: true,
        statusCode: 200,
        data: { newUsedDays: 1, lastUpdatedAt: new Date().toISOString() },
    };
    reverseResult = {
        success: true,
        statusCode: 200,
        data: { newUsedDays: 0, lastUpdatedAt: new Date().toISOString() },
    };
    async deduct() {
        return this.deductResult;
    }
    async reverse() {
        return this.reverseResult;
    }
}
describe('outbox.processor branch coverage', () => {
    let app;
    let ds;
    let processor;
    let writer;
    beforeEach(async () => {
        process.env.DB_PATH = ':memory:';
        process.env.DISABLE_BACKGROUND_WORKERS = '1';
        writer = new MockWriter();
        const mod = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] })
            .overrideProvider(hcm_deduction_writer_service_1.HcmDeductionWriter)
            .useValue(writer)
            .compile();
        app = mod.createNestApplication();
        await app.init();
        ds = app.get(typeorm_1.DataSource);
        processor = app.get(outbox_processor_1.OutboxProcessor);
    });
    afterEach(async () => {
        delete process.env.DISABLE_BACKGROUND_WORKERS;
        await app.close();
    });
    async function seedBase(state, eventType, attempts, outboxPayload) {
        const now = new Date().toISOString();
        const requestId = (0, node_crypto_1.randomUUID)();
        await ds.getRepository(balance_entity_1.Balance).upsert({
            id: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-u',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            totalDays: 5,
            usedDays: eventType === enums_1.OutboxEventType.HCM_REVERSE ? 1 : 0,
            pendingDays: eventType === enums_1.OutboxEventType.HCM_DEDUCT ? 1 : 0,
            hcmLastUpdatedAt: now,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
        }, ['employeeId', 'locationId', 'leaveType']);
        await ds.getRepository(time_off_request_entity_1.TimeOffRequest).insert({
            id: requestId,
            idempotencyKey: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-u',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            startDate: '2025-03-07',
            endDate: '2025-03-08',
            daysRequested: 1,
            state,
            lastOutboxEvent: eventType,
            hcmExternalRef: requestId,
            hcmTransactionId: 'txn-1',
            hcmResponseCode: null,
            hcmResponseBody: null,
            rejectionReason: null,
            failureReason: null,
            retryCount: attempts,
            createdBy: 'emp-u',
            approvedBy: null,
            createdAt: now,
            updatedAt: now,
        });
        const outbox = ds.getRepository(outbox_entity_1.Outbox).create({
            id: (0, node_crypto_1.randomUUID)(),
            eventType,
            payload: JSON.stringify(outboxPayload),
            requestId,
            status: 'PENDING',
            attempts,
            lastAttemptedAt: null,
            lastError: null,
            createdAt: now,
            processAfter: now,
        });
        await ds.getRepository(outbox_entity_1.Outbox).insert(outbox);
        return outbox;
    }
    it('handles deduct 409 as success path', async () => {
        writer.deductResult = {
            success: false,
            reason: 'CLIENT_ERROR',
            statusCode: 409,
            body: { newUsedDays: 1, lastUpdatedAt: new Date().toISOString() },
        };
        const outbox = await seedBase(enums_1.RequestState.SUBMITTED, enums_1.OutboxEventType.HCM_DEDUCT, 0, {
            externalRef: 'ext-1',
            employeeId: 'emp-u',
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            daysRequested: 1,
            startDate: '2025-03-07',
            endDate: '2025-03-08',
        });
        await processor.process(outbox);
        const req = await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: outbox.requestId });
        expect(req.state).toBe(enums_1.RequestState.APPROVED);
    });
    it('handles deduct client error reject branch', async () => {
        writer.deductResult = {
            success: false,
            reason: 'CLIENT_ERROR',
            statusCode: 422,
            body: { message: 'bad' },
        };
        const outbox = await seedBase(enums_1.RequestState.PENDING_HCM, enums_1.OutboxEventType.HCM_DEDUCT, 0, {
            externalRef: 'ext-2',
            employeeId: 'emp-u',
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            daysRequested: 1,
            startDate: '2025-03-07',
            endDate: '2025-03-08',
        });
        await processor.process(outbox);
        const req = await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: outbox.requestId });
        expect(req.state).toBe(enums_1.RequestState.REJECTED);
    });
    it('handles deduct retry scheduling and failed branch', async () => {
        writer.deductResult = { success: false, reason: 'SERVER_ERROR' };
        const retryOutbox = await seedBase(enums_1.RequestState.PENDING_HCM, enums_1.OutboxEventType.HCM_DEDUCT, 0, {
            externalRef: 'ext-3',
            employeeId: 'emp-u',
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            daysRequested: 1,
            startDate: '2025-03-07',
            endDate: '2025-03-08',
        });
        await processor.process(retryOutbox);
        const retryRow = await ds.getRepository(outbox_entity_1.Outbox).findOneByOrFail({ id: retryOutbox.id });
        expect(retryRow.status).toBe('PENDING');
        const failOutbox = await seedBase(enums_1.RequestState.PENDING_HCM, enums_1.OutboxEventType.HCM_DEDUCT, 3, {
            externalRef: 'ext-4',
            employeeId: 'emp-u',
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            daysRequested: 1,
            startDate: '2025-03-07',
            endDate: '2025-03-08',
        });
        await processor.process(failOutbox);
        const failedReq = await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: failOutbox.requestId });
        expect(failedReq.state).toBe(enums_1.RequestState.FAILED);
    });
    it('handles reverse success/409/client/server branches', async () => {
        // success
        writer.reverseResult = { success: true, statusCode: 200, data: { newUsedDays: 0, lastUpdatedAt: new Date().toISOString() } };
        const successOutbox = await seedBase(enums_1.RequestState.CANCELLING, enums_1.OutboxEventType.HCM_REVERSE, 0, {
            externalRef: 'ext-r1',
            hcmTransactionId: 'txn-1',
            employeeId: 'emp-u',
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            days: 1,
        });
        await processor.process(successOutbox);
        expect((await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: successOutbox.requestId })).state).toBe(enums_1.RequestState.CANCELLED);
        // 409 success-like
        writer.reverseResult = {
            success: false,
            reason: 'CLIENT_ERROR',
            statusCode: 409,
            body: { newUsedDays: 0, lastUpdatedAt: new Date().toISOString() },
        };
        const conflictOutbox = await seedBase(enums_1.RequestState.CANCELLING, enums_1.OutboxEventType.HCM_REVERSE, 0, {
            externalRef: 'ext-r2',
            hcmTransactionId: 'txn-1',
            employeeId: 'emp-u',
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            days: 1,
        });
        await processor.process(conflictOutbox);
        expect((await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: conflictOutbox.requestId })).state).toBe(enums_1.RequestState.CANCELLED);
        // client error -> REVERSAL_REJECTED
        writer.reverseResult = { success: false, reason: 'CLIENT_ERROR', statusCode: 404, body: { message: 'missing' } };
        const rejectOutbox = await seedBase(enums_1.RequestState.CANCELLING, enums_1.OutboxEventType.HCM_REVERSE, 0, {
            externalRef: 'ext-r3',
            hcmTransactionId: 'missing',
            employeeId: 'emp-u',
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            days: 1,
        });
        await processor.process(rejectOutbox);
        expect((await ds.getRepository(outbox_entity_1.Outbox).findOneByOrFail({ id: rejectOutbox.id })).lastError).toBe('REVERSAL_REJECTED');
        // server retry then fail
        writer.reverseResult = { success: false, reason: 'SERVER_ERROR' };
        const retryOutbox = await seedBase(enums_1.RequestState.CANCELLING, enums_1.OutboxEventType.HCM_REVERSE, 0, {
            externalRef: 'ext-r4',
            hcmTransactionId: 'txn-1',
            employeeId: 'emp-u',
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            days: 1,
        });
        await processor.process(retryOutbox);
        expect((await ds.getRepository(outbox_entity_1.Outbox).findOneByOrFail({ id: retryOutbox.id })).status).toBe('PENDING');
        const failOutbox = await seedBase(enums_1.RequestState.CANCELLING, enums_1.OutboxEventType.HCM_REVERSE, 3, {
            externalRef: 'ext-r5',
            hcmTransactionId: 'txn-1',
            employeeId: 'emp-u',
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            days: 1,
        });
        await processor.process(failOutbox);
        expect((await ds.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: failOutbox.requestId })).state).toBe(enums_1.RequestState.FAILED);
    });
});
//# sourceMappingURL=outbox.processor.spec.js.map