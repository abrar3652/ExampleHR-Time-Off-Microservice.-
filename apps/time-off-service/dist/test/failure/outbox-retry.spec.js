"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var BehaviorController_1;
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("typeorm");
const supertest_1 = __importDefault(require("supertest"));
const app_module_1 = require("../../src/app.module");
const enums_1 = require("../../src/domain/enums");
const balance_entity_1 = require("../../src/modules/balance/entities/balance.entity");
const hcm_deduction_writer_service_1 = require("../../src/modules/hcm-client/hcm-deduction-writer.service");
const outbox_entity_1 = require("../../src/modules/time-off/entities/outbox.entity");
const request_audit_log_entity_1 = require("../../src/modules/time-off/entities/request-audit-log.entity");
class MockHcmWriter {
    behavior = 'ok';
    remaining = 0;
    setBehavior(behavior, count) {
        this.behavior = behavior;
        this.remaining = count;
    }
    async deduct(payload) {
        if (this.behavior === '500' && this.remaining > 0) {
            this.remaining -= 1;
            return { success: false, reason: 'SERVER_ERROR', statusCode: 500, body: { message: 'boom' } };
        }
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
            data: {
                hcmTransactionId: 'rev-1',
                newTotalDays: 20,
                newUsedDays: 5,
                lastUpdatedAt: new Date().toISOString(),
            },
        };
    }
}
let BehaviorController = class BehaviorController {
    static { BehaviorController_1 = this; }
    static writer;
    setBehavior(body) {
        if (body.endpoint === 'deduct' && body.behavior === '500') {
            BehaviorController_1.writer.setBehavior('500', body.count);
        }
        else {
            BehaviorController_1.writer.setBehavior('ok', 0);
        }
        return { ok: true };
    }
};
__decorate([
    (0, common_1.Post)('/behavior'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BehaviorController.prototype, "setBehavior", null);
BehaviorController = BehaviorController_1 = __decorate([
    (0, common_1.Controller)('/__control')
], BehaviorController);
async function waitFor(predicate, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await predicate())
            return;
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error('Timed out waiting for condition');
}
describe('outbox worker retry flow', () => {
    jest.setTimeout(40000);
    let app;
    let ds;
    let writer;
    beforeEach(async () => {
        process.env.DB_PATH = ':memory:';
        writer = new MockHcmWriter();
        BehaviorController.writer = writer;
        const mod = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
            controllers: [BehaviorController],
        })
            .overrideProvider(hcm_deduction_writer_service_1.HcmDeductionWriter)
            .useValue(writer)
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
        if (app)
            await app.close();
    });
    it('approves request and updates balance/audit', async () => {
        const idKey = (0, node_crypto_1.randomUUID)();
        const create = await (0, supertest_1.default)(app.getHttpServer())
            .post('/time-off/requests')
            .set('X-Employee-Id', 'emp-001')
            .set('Idempotency-Key', idKey)
            .send({
            locationId: 'loc-nyc',
            leaveType: 'ANNUAL',
            startDate: '2025-02-10',
            endDate: '2025-02-12',
            daysRequested: 3,
        });
        expect(create.status).toBe(202);
        await waitFor(async () => {
            const row = await ds.getRepository(outbox_entity_1.Outbox).findOneBy({ requestId: create.body.requestId });
            return row?.status === 'DONE';
        }, 4000);
        const req = await (0, supertest_1.default)(app.getHttpServer()).get(`/time-off/requests/${create.body.requestId}`);
        expect(req.body.state).toBe('APPROVED');
        const bal = await ds.getRepository(balance_entity_1.Balance).findOneBy({
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
        });
        expect(bal?.usedDays).toBe(8);
        expect(bal?.pendingDays).toBe(0);
        const logs = await ds.getRepository(request_audit_log_entity_1.RequestAuditLog).findBy({ requestId: create.body.requestId });
        const pairs = logs.map((l) => `${l.fromState ?? 'null'}->${l.toState}`);
        expect(pairs).toContain('null->SUBMITTED');
        expect(pairs).toContain('SUBMITTED->PENDING_HCM');
        expect(pairs).toContain('PENDING_HCM->APPROVED');
    });
    it('fails after 3 server errors and restores pending_days', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/__control/behavior')
            .set('Idempotency-Key', (0, node_crypto_1.randomUUID)())
            .send({ endpoint: 'deduct', behavior: '500', count: 3 });
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
            const outbox = await ds.getRepository(outbox_entity_1.Outbox).findOneBy({ requestId: create.body.requestId });
            return outbox?.status === 'FAILED';
        }, 30000);
        const req = await (0, supertest_1.default)(app.getHttpServer()).get(`/time-off/requests/${create.body.requestId}`);
        expect(req.body.state).toBe('FAILED');
        const bal = await ds.getRepository(balance_entity_1.Balance).findOneBy({
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
        });
        expect(bal?.pendingDays).toBe(0);
        const outbox = await ds.getRepository(outbox_entity_1.Outbox).findOneBy({ requestId: create.body.requestId });
        expect(outbox?.status).toBe('FAILED');
        expect(outbox?.attempts).toBe(3);
    });
});
//# sourceMappingURL=outbox-retry.spec.js.map