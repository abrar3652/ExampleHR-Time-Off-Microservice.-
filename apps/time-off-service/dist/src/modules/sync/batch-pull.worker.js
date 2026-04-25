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
var BatchPullWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchPullWorker = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("typeorm");
const hcm_client_service_1 = require("../hcm-client/hcm-client.service");
const batch_sync_service_1 = require("./batch-sync.service");
const sync_checkpoint_entity_1 = require("./entities/sync-checkpoint.entity");
let BatchPullWorker = BatchPullWorker_1 = class BatchPullWorker {
    dataSource;
    hcmClient;
    batchSyncService;
    logger = new common_1.Logger(BatchPullWorker_1.name);
    constructor(dataSource, hcmClient, batchSyncService) {
        this.dataSource = dataSource;
        this.hcmClient = hcmClient;
        this.batchSyncService = batchSyncService;
    }
    async run() {
        if (process.env.DISABLE_BACKGROUND_WORKERS === '1')
            return;
        const checkpoint = await this.dataSource.getRepository(sync_checkpoint_entity_1.SyncCheckpoint).findOneBy({ id: 'singleton' });
        const since = checkpoint?.lastBatchAt ?? undefined;
        let cursor = null;
        while (true) {
            const params = { limit: '500' };
            if (cursor)
                params.cursor = cursor;
            else if (since)
                params.since = since;
            const result = await this.hcmClient.callHcm(() => this.hcmClient.axios.get('/api/hcm/batch/balances', { params }), 'batch_pull');
            if (!result.success) {
                this.logger.warn({ reason: 'batch pull failed', details: result.reason });
                return;
            }
            const page = result.data;
            if ((page.records?.length ?? 0) === 0 && !cursor)
                return;
            await this.batchSyncService.applyBatch(page.records ?? [], page.batchId, page.generatedAt);
            if (!page.hasMore)
                break;
            cursor = page.nextCursor ?? null;
        }
    }
};
exports.BatchPullWorker = BatchPullWorker;
__decorate([
    (0, schedule_1.Cron)('0 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BatchPullWorker.prototype, "run", null);
exports.BatchPullWorker = BatchPullWorker = BatchPullWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        hcm_client_service_1.HcmClient,
        batch_sync_service_1.BatchSyncService])
], BatchPullWorker);
//# sourceMappingURL=batch-pull.worker.js.map