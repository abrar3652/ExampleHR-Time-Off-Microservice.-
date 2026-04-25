"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const control_controller_1 = require("./controllers/control.controller");
const hcm_balance_controller_1 = require("./controllers/hcm-balance.controller");
const hcm_deduct_controller_1 = require("./controllers/hcm-deduct.controller");
const hcm_reverse_controller_1 = require("./controllers/hcm-reverse.controller");
const hcm_balance_entity_1 = require("./entities/hcm-balance.entity");
const hcm_batch_snapshot_entity_1 = require("./entities/hcm-batch-snapshot.entity");
const hcm_call_log_entity_1 = require("./entities/hcm-call-log.entity");
const hcm_chaos_config_entity_1 = require("./entities/hcm-chaos-config.entity");
const hcm_internal_clock_entity_1 = require("./entities/hcm-internal-clock.entity");
const hcm_transaction_entity_1 = require("./entities/hcm-transaction.entity");
const chaos_service_1 = require("./services/chaos.service");
const hcm_call_log_service_1 = require("./services/hcm-call-log.service");
const hcm_clock_service_1 = require("./services/hcm-clock.service");
async function ensureSingletonRows(dataSource) {
    const chaosRepo = dataSource.getRepository(hcm_chaos_config_entity_1.HcmChaosConfig);
    const clockRepo = dataSource.getRepository(hcm_internal_clock_entity_1.HcmInternalClock);
    await chaosRepo.upsert({ id: 'singleton', config: '{}' }, ['id']);
    await clockRepo.upsert({ id: 'singleton', offsetMs: 0 }, ['id']);
}
async function hcmNow(dataSource) {
    const clockRepo = dataSource.getRepository(hcm_internal_clock_entity_1.HcmInternalClock);
    const clock = await clockRepo.findOneBy({ id: 'singleton' });
    const offsetMs = clock?.offsetMs ?? 0;
    return new Date(Date.now() + offsetMs).toISOString();
}
async function seedBalancesForTestMode(dataSource) {
    if (process.env.NODE_ENV !== 'test')
        return;
    const balanceRepo = dataSource.getRepository(hcm_balance_entity_1.HcmBalance);
    const existingCount = await balanceRepo.count();
    if (existingCount > 0)
        return;
    const now = await hcmNow(dataSource);
    const seedBalances = [
        { employeeId: 'emp-001', locationId: 'loc-nyc', leaveType: 'ANNUAL', totalDays: 20, usedDays: 0 },
        { employeeId: 'emp-001', locationId: 'loc-nyc', leaveType: 'SICK', totalDays: 10, usedDays: 2 },
        { employeeId: 'emp-002', locationId: 'loc-nyc', leaveType: 'ANNUAL', totalDays: 15, usedDays: 5 },
        { employeeId: 'emp-002', locationId: 'loc-la', leaveType: 'ANNUAL', totalDays: 15, usedDays: 0 },
        { employeeId: 'emp-003', locationId: 'loc-nyc', leaveType: 'ANNUAL', totalDays: 0, usedDays: 0 },
    ];
    await balanceRepo.insert(seedBalances.map((b) => ({
        employeeId: b.employeeId,
        locationId: b.locationId,
        leaveType: b.leaveType,
        totalDays: b.totalDays,
        usedDays: b.usedDays,
        lastUpdatedAt: now,
        createdAt: now,
    })));
}
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            typeorm_1.TypeOrmModule.forRootAsync({
                useFactory: async () => ({
                    type: 'better-sqlite3',
                    database: process.env.DB_PATH ?? './hcm-mock.db',
                    enableWAL: true,
                    prepareDatabase: (db) => {
                        db.pragma('busy_timeout = 5000');
                    },
                    entities: [hcm_balance_entity_1.HcmBalance, hcm_transaction_entity_1.HcmTransaction, hcm_chaos_config_entity_1.HcmChaosConfig, hcm_call_log_entity_1.HcmCallLog, hcm_internal_clock_entity_1.HcmInternalClock, hcm_batch_snapshot_entity_1.HcmBatchSnapshot],
                    synchronize: true,
                }),
                dataSourceFactory: async (options) => {
                    if (!options)
                        throw new Error('TypeORM options missing');
                    const dataSource = new typeorm_2.DataSource(options);
                    await dataSource.initialize();
                    await ensureSingletonRows(dataSource);
                    await seedBalancesForTestMode(dataSource);
                    return dataSource;
                },
            }),
        ],
        controllers: [hcm_balance_controller_1.HcmBalanceController, hcm_deduct_controller_1.HcmDeductController, hcm_reverse_controller_1.HcmReverseController, control_controller_1.ControlController],
        providers: [chaos_service_1.ChaosService, hcm_clock_service_1.HcmClockService, hcm_call_log_service_1.HcmCallLogService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map