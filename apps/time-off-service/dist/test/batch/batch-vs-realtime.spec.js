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
const time_off_request_entity_1 = require("../../src/modules/time-off/entities/time-off-request.entity");
describe('batch-vs-realtime.spec', () => {
    let app;
    let ds;
    beforeEach(async () => {
        process.env.DB_PATH = ':memory:';
        const mod = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] }).compile();
        app = mod.createNestApplication();
        await app.init();
        ds = app.get(typeorm_1.DataSource);
    });
    afterEach(async () => {
        await app.close();
    });
    it('pending_days is recomputed and not overwritten by batch', async () => {
        const now = '2025-01-15T10:00:00Z';
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
            pendingDays: 99,
            hcmLastUpdatedAt: '2025-01-15T09:00:00Z',
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
        });
        await ds.getRepository(time_off_request_entity_1.TimeOffRequest).insert({
            id: (0, node_crypto_1.randomUUID)(),
            idempotencyKey: (0, node_crypto_1.randomUUID)(),
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
            startDate: '2025-01-20',
            endDate: '2025-01-22',
            daysRequested: 3,
            state: enums_1.RequestState.SUBMITTED,
            lastOutboxEvent: null,
            hcmExternalRef: (0, node_crypto_1.randomUUID)(),
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
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/sync/batch/balances')
            .set('Idempotency-Key', (0, node_crypto_1.randomUUID)())
            .send({
            batchId: 'batch-2',
            generatedAt: '2025-01-15T10:05:00Z',
            records: [
                {
                    employeeId: 'emp-001',
                    locationId: 'loc-nyc',
                    leaveType: 'ANNUAL',
                    totalDays: 22,
                    usedDays: 6,
                    hcmLastUpdatedAt: '2025-01-15T10:04:00Z',
                },
            ],
        });
        expect(res.status).toBe(200);
        expect(res.body.processed).toBe(1);
        const bal = await ds.getRepository(balance_entity_1.Balance).findOneByOrFail({
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
        });
        expect(bal.pendingDays).toBe(3);
        expect(bal.totalDays).toBe(22);
        expect(bal.usedDays).toBe(6);
    });
});
//# sourceMappingURL=batch-vs-realtime.spec.js.map