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
exports.HcmPushJob = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const chaos_service_1 = require("../services/chaos.service");
const hcm_batch_service_1 = require("../services/hcm-batch.service");
const hcm_call_log_service_1 = require("../services/hcm-call-log.service");
let HcmPushJob = class HcmPushJob {
    chaos;
    batchService;
    callLog;
    lastRunAt = 0;
    constructor(chaos, batchService, callLog) {
        this.chaos = chaos;
        this.batchService = batchService;
        this.callLog = callLog;
    }
    async run() {
        const config = await this.chaos.loadConfig();
        const configured = config.batch_push;
        if (!configured)
            return;
        if (configured.behavior !== 'enable' && configured.behavior !== 'stale_timestamps')
            return;
        const intervalSeconds = configured.interval_seconds ?? 60;
        const nowMs = Date.now();
        if (nowMs - this.lastRunAt < intervalSeconds * 1000)
            return;
        this.lastRunAt = nowMs;
        const rule = await this.chaos.shouldApplyChaos('batch_push');
        if (!rule)
            return;
        if (rule.behavior !== 'enable' && rule.behavior !== 'stale_timestamps')
            return;
        const snapshot = await this.batchService.createSnapshot();
        const page = await this.batchService.getPage(snapshot.batchId, -1, Number.MAX_SAFE_INTEGER);
        const staleMode = rule.behavior === 'stale_timestamps';
        const records = staleMode
            ? page.records.map((r) => ({
                ...r,
                hcmLastUpdatedAt: new Date(Date.parse(r.hcmLastUpdatedAt) - 2 * 60 * 60 * 1000).toISOString(),
            }))
            : page.records;
        const payload = {
            batchId: snapshot.batchId,
            generatedAt: snapshot.generatedAt,
            records,
        };
        const started = Date.now();
        let status = 500;
        let responseBody = null;
        try {
            const response = await fetch('http://localhost:3000/sync/batch/balances', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });
            status = response.status;
            const text = await response.text();
            if (text.length === 0) {
                responseBody = null;
            }
            else {
                try {
                    responseBody = JSON.parse(text);
                }
                catch {
                    responseBody = { raw: text };
                }
            }
        }
        catch (err) {
            responseBody = { error: 'PUSH_FAILED', message: err instanceof Error ? err.message : 'Unknown error' };
        }
        await this.callLog.append({
            endpoint: 'batch_push',
            method: 'POST',
            requestBody: payload,
            responseStatus: status,
            responseBody,
            chaosApplied: rule.behavior,
            durationMs: Date.now() - started,
        });
    }
};
exports.HcmPushJob = HcmPushJob;
__decorate([
    (0, schedule_1.Interval)(1000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HcmPushJob.prototype, "run", null);
exports.HcmPushJob = HcmPushJob = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [chaos_service_1.ChaosService,
        hcm_batch_service_1.HcmBatchService,
        hcm_call_log_service_1.HcmCallLogService])
], HcmPushJob);
//# sourceMappingURL=hcm-push.job.js.map