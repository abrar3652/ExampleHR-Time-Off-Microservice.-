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
var TestController_1;
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const testing_1 = require("@nestjs/testing");
const supertest_1 = __importDefault(require("supertest"));
const typeorm_1 = require("@nestjs/typeorm");
const idempotency_module_1 = require("../../src/modules/idempotency/idempotency.module");
const idempotency_interceptor_1 = require("../../src/modules/idempotency/idempotency.interceptor");
const idempotency_record_entity_1 = require("../../src/modules/idempotency/entities/idempotency-record.entity");
const idempotency_repository_1 = require("../../src/modules/idempotency/idempotency.repository");
let TestController = class TestController {
    static { TestController_1 = this; }
    static calls = 0;
    echo(body) {
        TestController_1.calls += 1;
        return { ok: true, body };
    }
};
__decorate([
    (0, common_1.Post)('/__test/echo'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], TestController.prototype, "echo", null);
TestController = TestController_1 = __decorate([
    (0, common_1.Controller)()
], TestController);
describe('IdempotencyInterceptor', () => {
    let app;
    let repo;
    beforeEach(async () => {
        TestController.calls = 0;
        const mod = await testing_1.Test.createTestingModule({
            imports: [
                typeorm_1.TypeOrmModule.forRoot({
                    type: 'better-sqlite3',
                    database: ':memory:',
                    enableWAL: true,
                    autoLoadEntities: true,
                    synchronize: true,
                }),
                typeorm_1.TypeOrmModule.forFeature([idempotency_record_entity_1.IdempotencyRecord]),
                idempotency_module_1.IdempotencyModule,
            ],
            controllers: [TestController],
        }).compile();
        app = mod.createNestApplication();
        app.useGlobalInterceptors(mod.get(idempotency_interceptor_1.IdempotencyInterceptor));
        await app.init();
        repo = app.get(idempotency_repository_1.IdempotencyRepository);
    });
    afterEach(async () => {
        await app.close();
    });
    it('Same key, same body -> second call returns stored response, single DB record', async () => {
        const key = '11111111-1111-4111-8111-111111111111';
        const body = { a: 1 };
        const r1 = await (0, supertest_1.default)(app.getHttpServer()).post('/__test/echo').set('Idempotency-Key', key).send(body);
        const r2 = await (0, supertest_1.default)(app.getHttpServer()).post('/__test/echo').set('Idempotency-Key', key).send(body);
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect(r2.body).toEqual(r1.body);
        expect(TestController.calls).toBe(1);
        const record = await repo.findByKey(key);
        expect(record?.status).toBe('COMPLETE');
    });
    it('Same key, different body -> 409 IDEMPOTENCY_CONFLICT', async () => {
        const key = '22222222-2222-4222-8222-222222222222';
        await (0, supertest_1.default)(app.getHttpServer()).post('/__test/echo').set('Idempotency-Key', key).send({ a: 1 });
        const r2 = await (0, supertest_1.default)(app.getHttpServer()).post('/__test/echo').set('Idempotency-Key', key).send({ a: 2 });
        expect(r2.status).toBe(409);
        expect(r2.body.error).toBe('IDEMPOTENCY_CONFLICT');
        expect(r2.body.message).toBe('This idempotency key was already used with different parameters.');
    });
    it('10 concurrent calls with same key -> exactly 1 DB record created', async () => {
        const key = '33333333-3333-4333-8333-333333333333';
        const body = { a: 1 };
        const reqs = Array.from({ length: 10 }, () => (0, supertest_1.default)(app.getHttpServer()).post('/__test/echo').set('Idempotency-Key', key).send(body));
        const results = await Promise.all(reqs);
        expect(results.every((r) => r.status === 200)).toBe(true);
        expect(TestController.calls).toBe(1);
        const record = await repo.findByKey(key);
        expect(record?.status).toBe('COMPLETE');
    });
});
//# sourceMappingURL=idempotency.spec.js.map