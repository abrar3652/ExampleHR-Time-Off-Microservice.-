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
var OutboxWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxWorker = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const outbox_processor_1 = require("./outbox.processor");
const outbox_repository_1 = require("./outbox.repository");
let OutboxWorker = OutboxWorker_1 = class OutboxWorker {
    outboxRepo;
    processor;
    logger = new common_1.Logger(OutboxWorker_1.name);
    constructor(outboxRepo, processor) {
        this.outboxRepo = outboxRepo;
        this.processor = processor;
    }
    async poll() {
        if (process.env.DISABLE_BACKGROUND_WORKERS === '1')
            return;
        await this.outboxRepo.resetStuckProcessing();
        const claimed = await this.outboxRepo.claimPending(5);
        for (const record of claimed) {
            try {
                await this.processor.process(record);
                this.logger.log({
                    outboxId: record.id,
                    requestId: record.requestId,
                    eventType: record.eventType,
                    attempt: record.attempts + 1,
                    result: 'OK',
                });
            }
            catch (err) {
                this.logger.error({
                    outboxId: record.id,
                    requestId: record.requestId,
                    eventType: record.eventType,
                    attempt: record.attempts + 1,
                    result: 'ERROR',
                    err: err?.message ?? String(err),
                });
            }
        }
    }
};
exports.OutboxWorker = OutboxWorker;
__decorate([
    (0, schedule_1.Interval)(500),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OutboxWorker.prototype, "poll", null);
exports.OutboxWorker = OutboxWorker = OutboxWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [outbox_repository_1.OutboxRepository,
        outbox_processor_1.OutboxProcessor])
], OutboxWorker);
//# sourceMappingURL=outbox.worker.js.map