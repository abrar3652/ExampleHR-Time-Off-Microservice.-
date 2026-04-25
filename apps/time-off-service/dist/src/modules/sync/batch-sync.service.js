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
var BatchSyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchSyncService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const enums_1 = require("../../domain/enums");
const balance_entity_1 = require("../balance/entities/balance.entity");
const balance_change_log_entity_1 = require("../balance/entities/balance-change-log.entity");
const sync_checkpoint_entity_1 = require("./entities/sync-checkpoint.entity");
let BatchSyncService = BatchSyncService_1 = class BatchSyncService {
    dataSource;
    logger = new common_1.Logger(BatchSyncService_1.name);
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    toHcmMillis(value) {
        const normalized = /z$/i.test(value) ? value : `${value}Z`;
        return Date.parse(normalized);
    }
    async applyBatch(records, batchId, generatedAt) {
        let processed = 0;
        let skipped = 0;
        let failed = 0;
        for (const record of records) {
            try {
                const result = await this.applyOneRecord(record, batchId);
                if (result === 'skipped')
                    skipped += 1;
                else
                    processed += 1;
            }
            catch (err) {
                failed += 1;
                this.logger.error({ batchId, record, err }, 'batch record apply failed');
            }
        }
        const now = new Date().toISOString();
        await this.dataSource.getRepository(sync_checkpoint_entity_1.SyncCheckpoint).save({
            id: 'singleton',
            lastBatchId: batchId,
            lastBatchAt: generatedAt,
            lastRecordCount: processed,
            updatedAt: now,
        });
        return { processed, skipped, failed };
    }
    async applyOneRecord(record, batchId) {
        return this.dataSource.transaction(async (manager) => {
            const now = new Date().toISOString();
            const existing = await manager.getRepository(balance_entity_1.Balance).findOne({
                where: { employeeId: record.employeeId, locationId: record.locationId, leaveType: record.leaveType },
            });
            if (!existing) {
                const id = (0, node_crypto_1.randomUUID)();
                await manager.getRepository(balance_entity_1.Balance).insert({
                    id,
                    employeeId: record.employeeId,
                    locationId: record.locationId,
                    leaveType: record.leaveType,
                    totalDays: record.totalDays,
                    usedDays: record.usedDays,
                    pendingDays: 0,
                    hcmLastUpdatedAt: record.hcmLastUpdatedAt,
                    syncedAt: now,
                    createdAt: now,
                    updatedAt: now,
                });
                await manager.getRepository(balance_change_log_entity_1.BalanceChangeLog).insert([
                    {
                        id: (0, node_crypto_1.randomUUID)(),
                        balanceId: id,
                        employeeId: record.employeeId,
                        locationId: record.locationId,
                        leaveType: record.leaveType,
                        fieldChanged: 'total_days',
                        oldValue: 0,
                        newValue: record.totalDays,
                        delta: record.totalDays,
                        source: enums_1.BalanceChangeSource.BATCH_SYNC,
                        sourceRef: batchId,
                        hcmTimestamp: record.hcmLastUpdatedAt,
                        createdAt: now,
                    },
                    {
                        id: (0, node_crypto_1.randomUUID)(),
                        balanceId: id,
                        employeeId: record.employeeId,
                        locationId: record.locationId,
                        leaveType: record.leaveType,
                        fieldChanged: 'used_days',
                        oldValue: 0,
                        newValue: record.usedDays,
                        delta: record.usedDays,
                        source: enums_1.BalanceChangeSource.BATCH_SYNC,
                        sourceRef: batchId,
                        hcmTimestamp: record.hcmLastUpdatedAt,
                        createdAt: now,
                    },
                ]);
                return 'applied';
            }
            const incomingTs = this.toHcmMillis(record.hcmLastUpdatedAt);
            const existingTs = this.toHcmMillis(existing.hcmLastUpdatedAt);
            if (!Number.isNaN(incomingTs) && !Number.isNaN(existingTs) && incomingTs <= existingTs) {
                return 'skipped';
            }
            if ((Number.isNaN(incomingTs) || Number.isNaN(existingTs)) &&
                record.hcmLastUpdatedAt <= existing.hcmLastUpdatedAt) {
                return 'skipped';
            }
            const sum = await manager
                .createQueryBuilder()
                .select('COALESCE(SUM(r.days_requested), 0)', 'pending')
                .from('time_off_request', 'r')
                .where('r.employee_id = :employeeId', { employeeId: record.employeeId })
                .andWhere('r.location_id = :locationId', { locationId: record.locationId })
                .andWhere('r.leave_type = :leaveType', { leaveType: record.leaveType })
                .andWhere("r.state IN ('SUBMITTED','PENDING_HCM','CANCELLING')")
                .getRawOne();
            const pendingDays = Number(sum?.pending ?? 0);
            const oldTotal = existing.totalDays;
            const oldUsed = existing.usedDays;
            await manager.getRepository(balance_entity_1.Balance).update({ id: existing.id }, {
                totalDays: record.totalDays,
                usedDays: record.usedDays,
                pendingDays,
                hcmLastUpdatedAt: record.hcmLastUpdatedAt,
                syncedAt: now,
                updatedAt: now,
            });
            if (oldTotal !== record.totalDays) {
                await manager.getRepository(balance_change_log_entity_1.BalanceChangeLog).insert({
                    id: (0, node_crypto_1.randomUUID)(),
                    balanceId: existing.id,
                    employeeId: existing.employeeId,
                    locationId: existing.locationId,
                    leaveType: existing.leaveType,
                    fieldChanged: 'total_days',
                    oldValue: oldTotal,
                    newValue: record.totalDays,
                    delta: record.totalDays - oldTotal,
                    source: enums_1.BalanceChangeSource.BATCH_SYNC,
                    sourceRef: batchId,
                    hcmTimestamp: record.hcmLastUpdatedAt,
                    createdAt: now,
                });
            }
            if (oldUsed !== record.usedDays) {
                await manager.getRepository(balance_change_log_entity_1.BalanceChangeLog).insert({
                    id: (0, node_crypto_1.randomUUID)(),
                    balanceId: existing.id,
                    employeeId: existing.employeeId,
                    locationId: existing.locationId,
                    leaveType: existing.leaveType,
                    fieldChanged: 'used_days',
                    oldValue: oldUsed,
                    newValue: record.usedDays,
                    delta: record.usedDays - oldUsed,
                    source: enums_1.BalanceChangeSource.BATCH_SYNC,
                    sourceRef: batchId,
                    hcmTimestamp: record.hcmLastUpdatedAt,
                    createdAt: now,
                });
            }
            return 'applied';
        });
    }
};
exports.BatchSyncService = BatchSyncService;
exports.BatchSyncService = BatchSyncService = BatchSyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], BatchSyncService);
//# sourceMappingURL=batch-sync.service.js.map