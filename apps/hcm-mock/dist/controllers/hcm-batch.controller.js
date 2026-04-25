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
exports.HcmBatchController = void 0;
const common_1 = require("@nestjs/common");
const hcm_batch_service_1 = require("../services/hcm-batch.service");
const chaos_service_1 = require("../services/chaos.service");
let HcmBatchController = class HcmBatchController {
    batchService;
    chaos;
    constructor(batchService, chaos) {
        this.batchService = batchService;
        this.chaos = chaos;
    }
    async getBalances(since, cursor, limitRaw) {
        const chaosRule = await this.chaos.shouldApplyChaos('batch_get');
        await this.chaos.applyDelay(chaosRule);
        const injected = await this.chaos.injectBehavior(chaosRule, { endpoint: 'batch_get' });
        if (injected) {
            throw new common_1.HttpException(injected.body, injected.status);
        }
        const parsedLimit = Number(limitRaw ?? 100);
        const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(500, parsedLimit)) : 100;
        if (!cursor) {
            const snapshot = await this.batchService.createSnapshot(since);
            const page = await this.batchService.getPage(snapshot.batchId, -1, limit);
            const hasMore = page.records.length < snapshot.totalCount;
            return {
                batchId: snapshot.batchId,
                generatedAt: snapshot.generatedAt,
                records: page.records,
                hasMore,
                nextCursor: hasMore && page.nextLastIndex !== null
                    ? this.batchService.encodeCursor({ batchId: snapshot.batchId, lastIndex: page.nextLastIndex })
                    : null,
                totalCount: snapshot.totalCount,
            };
        }
        const decoded = this.batchService.decodeCursor(cursor);
        if (!decoded)
            throw new common_1.BadRequestException({ error: 'INVALID_CURSOR', message: 'Cursor is invalid' });
        const page = await this.batchService.getPage(decoded.batchId, decoded.lastIndex, limit);
        const consumed = decoded.lastIndex + 1 + page.records.length;
        const hasMore = consumed < page.totalCount;
        return {
            batchId: decoded.batchId,
            generatedAt: page.generatedAt,
            records: page.records,
            hasMore,
            nextCursor: hasMore && page.nextLastIndex !== null
                ? this.batchService.encodeCursor({ batchId: decoded.batchId, lastIndex: page.nextLastIndex })
                : null,
            totalCount: page.totalCount,
        };
    }
};
exports.HcmBatchController = HcmBatchController;
__decorate([
    (0, common_1.Get)('/balances'),
    __param(0, (0, common_1.Query)('since')),
    __param(1, (0, common_1.Query)('cursor')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], HcmBatchController.prototype, "getBalances", null);
exports.HcmBatchController = HcmBatchController = __decorate([
    (0, common_1.Controller)('/api/hcm/batch'),
    __metadata("design:paramtypes", [hcm_batch_service_1.HcmBatchService,
        chaos_service_1.ChaosService])
], HcmBatchController);
//# sourceMappingURL=hcm-batch.controller.js.map