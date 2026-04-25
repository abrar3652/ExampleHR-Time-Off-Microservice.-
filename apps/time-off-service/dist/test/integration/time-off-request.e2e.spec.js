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
const outbox_entity_1 = require("../../src/modules/time-off/entities/outbox.entity");
const request_audit_log_entity_1 = require("../../src/modules/time-off/entities/request-audit-log.entity");
const time_off_request_entity_1 = require("../../src/modules/time-off/entities/time-off-request.entity");
describe('POST /time-off/requests (creation cases)', () => {
    let app;
    let dataSource;
    beforeEach(async () => {
        process.env.DB_PATH = ':memory:';
        const mod = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] }).compile();
        app = mod.createNestApplication();
        await app.init();
        dataSource = app.get(typeorm_1.DataSource);
        const now = new Date().toISOString();
        await dataSource.getRepository(balance_entity_1.Balance).delete({
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
        });
        await dataSource.getRepository(balance_entity_1.Balance).save({
            id: 'bal-emp001',
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
    it('creates request + outbox + pending increment + audit, and replays idempotent duplicate', async () => {
        const idempotencyKey = (0, node_crypto_1.randomUUID)();
        const body = {
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            startDate: '2025-02-10',
            endDate: '2025-02-12',
            daysRequested: 3,
        };
        const r1 = await (0, supertest_1.default)(app.getHttpServer())
            .post('/time-off/requests')
            .set('X-Employee-Id', 'emp-001')
            .set('Idempotency-Key', idempotencyKey)
            .send(body);
        expect(r1.status).toBe(202);
        expect(r1.body.state).toBe('SUBMITTED');
        expect(r1.body.requestId).toBeTruthy();
        const requestRow = await dataSource.getRepository(time_off_request_entity_1.TimeOffRequest).findOneBy({ id: r1.body.requestId });
        expect(['SUBMITTED', 'PENDING_HCM', 'APPROVED']).toContain(requestRow?.state);
        const outboxRow = await dataSource.getRepository(outbox_entity_1.Outbox).findOneBy({ requestId: r1.body.requestId });
        expect(outboxRow?.status).toMatch(/PENDING|PROCESSING|DONE/);
        expect(outboxRow?.eventType).toBe('HCM_DEDUCT');
        const balanceRows = await dataSource.query("SELECT pending_days FROM balance WHERE employee_id = ? AND location_id = ? AND leave_type = ?", ['emp-001', 'loc-nyc', enums_1.LeaveType.ANNUAL]);
        expect(balanceRows[0]?.pending_days).toBe(3);
        const audit = await dataSource.getRepository(request_audit_log_entity_1.RequestAuditLog).findOneBy({ requestId: r1.body.requestId });
        expect(audit?.toState).toBe('SUBMITTED');
        const r2 = await (0, supertest_1.default)(app.getHttpServer())
            .post('/time-off/requests')
            .set('X-Employee-Id', 'emp-001')
            .set('Idempotency-Key', idempotencyKey)
            .send(body);
        expect(r2.status).toBe(202);
        expect(r2.body).toEqual(r1.body);
        expect(await dataSource.getRepository(time_off_request_entity_1.TimeOffRequest).countBy({ idempotencyKey })).toBe(1);
        expect(await dataSource.getRepository(outbox_entity_1.Outbox).countBy({ requestId: r1.body.requestId })).toBe(1);
        expect(await dataSource.getRepository(request_audit_log_entity_1.RequestAuditLog).countBy({ requestId: r1.body.requestId })).toBeGreaterThanOrEqual(1);
    });
});
//# sourceMappingURL=time-off-request.e2e.spec.js.map