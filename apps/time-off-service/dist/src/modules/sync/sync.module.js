"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const hcm_client_module_1 = require("../hcm-client/hcm-client.module");
const batch_sync_controller_1 = require("./batch-sync.controller");
const batch_pull_worker_1 = require("./batch-pull.worker");
const batch_sync_service_1 = require("./batch-sync.service");
const reconciliation_worker_1 = require("./reconciliation.worker");
const reconciliation_log_entity_1 = require("./entities/reconciliation-log.entity");
const sync_checkpoint_entity_1 = require("./entities/sync-checkpoint.entity");
let SyncModule = class SyncModule {
};
exports.SyncModule = SyncModule;
exports.SyncModule = SyncModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([sync_checkpoint_entity_1.SyncCheckpoint, reconciliation_log_entity_1.ReconciliationLog]), hcm_client_module_1.HcmClientModule],
        controllers: [batch_sync_controller_1.BatchSyncController],
        providers: [batch_sync_service_1.BatchSyncService, batch_pull_worker_1.BatchPullWorker, reconciliation_worker_1.ReconciliationWorker],
        exports: [batch_sync_service_1.BatchSyncService],
    })
], SyncModule);
//# sourceMappingURL=sync.module.js.map