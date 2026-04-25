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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchSyncController = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const batch_sync_service_1 = require("./batch-sync.service");
const reconciliation_log_entity_1 = require("./entities/reconciliation-log.entity");
let BatchSyncController = class BatchSyncController {
    service;
    dataSource;
    constructor(service, dataSource) {
        this.service = service;
        this.dataSource = dataSource;
    }
    async applyBatch(body) {
        const result = await this.service.applyBatch(body.records ?? [], body.batchId, body.generatedAt);
        return {
            batchId: body.batchId,
            processed: result.processed,
            skipped: result.skipped,
            failed: result.failed,
            message: `Batch applied. ${result.skipped} records skipped (older than local data).`,
        };
    }
    async reconciliationStatus() {
        const latest = await this.dataSource
            .getRepository(reconciliation_log_entity_1.ReconciliationLog)
            .createQueryBuilder('r')
            .orderBy('r.created_at', 'DESC')
            .getOne();
        if (!latest) {
            return {
                runId: null,
                ranAt: null,
                totalChecked: 0,
                driftsDetected: 0,
                autoCorrected: 0,
                pendingReview: 0,
            };
        }
        const rows = await this.dataSource.getRepository(reconciliation_log_entity_1.ReconciliationLog).findBy({ runId: latest.runId });
        return {
            runId: latest.runId,
            ranAt: latest.createdAt,
            totalChecked: rows.length,
            driftsDetected: rows.length,
            autoCorrected: rows.filter((r) => r.resolution === 'AUTO_CORRECTED').length,
            pendingReview: rows.filter((r) => r.resolution !== 'AUTO_CORRECTED').length,
        };
    }
};
exports.BatchSyncController = BatchSyncController;
__decorate([
    (0, common_1.Post)('/batch/balances'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BatchSyncController.prototype, "applyBatch", null);
__decorate([
    (0, common_2.Get)('/reconciliation/status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BatchSyncController.prototype, "reconciliationStatus", null);
exports.BatchSyncController = BatchSyncController = __decorate([
    (0, common_1.Controller)('/sync'),
    __metadata("design:paramtypes", [batch_sync_service_1.BatchSyncService,
        typeorm_1.DataSource])
], BatchSyncController);
//# sourceMappingURL=batch-sync.controller.js.map