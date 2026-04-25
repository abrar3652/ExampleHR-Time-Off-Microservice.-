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
var ReconciliationWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconciliationWorker = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const enums_1 = require("../../domain/enums");
const balance_entity_1 = require("../balance/entities/balance.entity");
const balance_change_log_entity_1 = require("../balance/entities/balance-change-log.entity");
const hcm_client_service_1 = require("../hcm-client/hcm-client.service");
const reconciliation_log_entity_1 = require("./entities/reconciliation-log.entity");
let ReconciliationWorker = ReconciliationWorker_1 = class ReconciliationWorker {
    dataSource;
    hcmClient;
    logger = new common_1.Logger(ReconciliationWorker_1.name);
    constructor(dataSource, hcmClient) {
        this.dataSource = dataSource;
        this.hcmClient = hcmClient;
    }
    async run() {
        if (process.env.DISABLE_BACKGROUND_WORKERS === '1')
            return;
        const runId = (0, node_crypto_1.randomUUID)();
        this.logger.log({ runId, event: 'reconciliation_start' });
        const balances = await this.dataSource.getRepository(balance_entity_1.Balance).find();
        for (const local of balances) {
            const hcmResult = await this.hcmClient.callHcm(() => this.hcmClient.axios.get(`/api/hcm/balance/${local.employeeId}/${local.locationId}/${local.leaveType}`), `reconcile:${local.employeeId}:${local.locationId}:${local.leaveType}`);
            if (!hcmResult.success) {
                this.logger.warn({ runId, employee: local.employeeId, reason: 'hcm_fetch_failed' });
                continue;
            }
            const totalDrift = hcmResult.data.totalDays - local.totalDays;
            if (Math.abs(totalDrift) <= 0.0001)
                continue;
            const now = new Date().toISOString();
            const driftEntry = this.dataSource.getRepository(reconciliation_log_entity_1.ReconciliationLog).create({
                id: (0, node_crypto_1.randomUUID)(),
                runId,
                employeeId: local.employeeId,
                locationId: local.locationId,
                leaveType: local.leaveType,
                driftField: 'total_days',
                localValue: local.totalDays,
                hcmValue: hcmResult.data.totalDays,
                adjustedLocal: local.totalDays,
                drift: totalDrift,
                resolved: 0,
                resolution: 'MANUAL_REVIEW',
                resolvedAt: null,
                createdAt: now,
            });
            await this.dataSource.getRepository(reconciliation_log_entity_1.ReconciliationLog).save(driftEntry);
            const driftAgeMinutes = (Date.now() - new Date(local.syncedAt).getTime()) / 60000;
            const canAutoCorrect = driftAgeMinutes > 15 && hcmResult.data.lastUpdatedAt > local.hcmLastUpdatedAt;
            if (!canAutoCorrect)
                continue;
            await this.dataSource.transaction(async (manager) => {
                await manager.getRepository(balance_entity_1.Balance).update({ id: local.id }, {
                    totalDays: hcmResult.data.totalDays,
                    hcmLastUpdatedAt: hcmResult.data.lastUpdatedAt,
                    updatedAt: now,
                });
                await manager.getRepository(balance_change_log_entity_1.BalanceChangeLog).insert({
                    id: (0, node_crypto_1.randomUUID)(),
                    balanceId: local.id,
                    employeeId: local.employeeId,
                    locationId: local.locationId,
                    leaveType: local.leaveType,
                    fieldChanged: 'total_days',
                    oldValue: local.totalDays,
                    newValue: hcmResult.data.totalDays,
                    delta: hcmResult.data.totalDays - local.totalDays,
                    source: enums_1.BalanceChangeSource.AUTO_RECONCILE,
                    sourceRef: runId,
                    hcmTimestamp: hcmResult.data.lastUpdatedAt,
                    createdAt: now,
                });
                await manager.getRepository(reconciliation_log_entity_1.ReconciliationLog).update({ id: driftEntry.id }, { resolved: 1, resolution: 'AUTO_CORRECTED', resolvedAt: now });
            });
        }
        this.logger.log({ runId, event: 'reconciliation_complete', checked: balances.length });
    }
};
exports.ReconciliationWorker = ReconciliationWorker;
__decorate([
    (0, schedule_1.Cron)('*/15 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ReconciliationWorker.prototype, "run", null);
exports.ReconciliationWorker = ReconciliationWorker = ReconciliationWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        hcm_client_service_1.HcmClient])
], ReconciliationWorker);
//# sourceMappingURL=reconciliation.worker.js.map