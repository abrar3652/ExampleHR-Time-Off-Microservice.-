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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const hcm_client_service_1 = require("./modules/hcm-client/hcm-client.service");
const reconciliation_log_entity_1 = require("./modules/sync/entities/reconciliation-log.entity");
const sync_checkpoint_entity_1 = require("./modules/sync/entities/sync-checkpoint.entity");
const outbox_entity_1 = require("./modules/time-off/entities/outbox.entity");
let HealthController = class HealthController {
    dataSource;
    hcmClient;
    constructor(dataSource, hcmClient) {
        this.dataSource = dataSource;
        this.hcmClient = hcmClient;
    }
    async getHealth() {
        const hcmPing = await this.hcmClient.callHcm(() => this.hcmClient.axios.get('/api/hcm/balance/emp-001/loc-nyc/ANNUAL'), 'health:ping');
        const outboxPendingCount = await this.dataSource.getRepository(outbox_entity_1.Outbox).count({
            where: { status: (0, typeorm_1.In)(['PENDING', 'PROCESSING']) },
        });
        const checkpoint = await this.dataSource.getRepository(sync_checkpoint_entity_1.SyncCheckpoint).findOneBy({ id: 'singleton' });
        const latestReconciliation = await this.dataSource
            .getRepository(reconciliation_log_entity_1.ReconciliationLog)
            .createQueryBuilder('r')
            .select('MAX(r.created_at)', 'lastReconciliationAt')
            .getRawOne();
        return {
            status: 'ok',
            hcmReachable: hcmPing.success,
            outboxPendingCount,
            lastBatchSyncAt: checkpoint?.lastBatchAt ?? null,
            lastReconciliationAt: latestReconciliation?.lastReconciliationAt ?? null,
        };
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "getHealth", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)('/health'),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        hcm_client_service_1.HcmClient])
], HealthController);
//# sourceMappingURL=health.controller.js.map