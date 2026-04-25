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
exports.HcmDriftJob = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("typeorm");
const hcm_balance_entity_1 = require("../entities/hcm-balance.entity");
const hcm_call_log_service_1 = require("../services/hcm-call-log.service");
const hcm_clock_service_1 = require("../services/hcm-clock.service");
let HcmDriftJob = class HcmDriftJob {
    dataSource;
    clock;
    callLog;
    constructor(dataSource, clock, callLog) {
        this.dataSource = dataSource;
        this.clock = clock;
        this.callLog = callLog;
    }
    async run() {
        if (process.env.NODE_ENV !== 'test')
            return;
        const started = Date.now();
        const repo = this.dataSource.getRepository(hcm_balance_entity_1.HcmBalance);
        const balances = await repo.find();
        if (balances.length === 0)
            return;
        const index = Math.floor(Math.random() * balances.length);
        const selected = balances[index];
        if (!selected)
            return;
        const now = await this.clock.nowIso();
        const isAnniversary = Math.random() < 0.5;
        if (isAnniversary) {
            const delta = this.roundHalf(this.randomFloat(1, 5));
            await repo.update({ id: selected.id }, {
                totalDays: selected.totalDays + delta,
                lastUpdatedAt: now,
            });
            await this.callLog.append({
                endpoint: 'DRIFT_JOB',
                method: 'JOB',
                requestBody: { type: 'work_anniversary', balanceId: selected.id, delta },
                responseStatus: 200,
                responseBody: { ok: true },
                chaosApplied: null,
                durationMs: Date.now() - started,
            });
            return;
        }
        const requested = this.roundHalf(this.randomFloat(0.5, 2));
        const available = Math.max(0, selected.totalDays - selected.usedDays);
        const applied = Math.min(available, requested);
        await repo.update({ id: selected.id }, {
            usedDays: selected.usedDays + applied,
            lastUpdatedAt: now,
        });
        await this.callLog.append({
            endpoint: 'DRIFT_JOB',
            method: 'JOB',
            requestBody: { type: 'random_deduction', balanceId: selected.id, requested, applied },
            responseStatus: 200,
            responseBody: { ok: true },
            chaosApplied: null,
            durationMs: Date.now() - started,
        });
    }
    randomFloat(min, max) {
        return Math.random() * (max - min) + min;
    }
    roundHalf(value) {
        return Math.round(value * 2) / 2;
    }
};
exports.HcmDriftJob = HcmDriftJob;
__decorate([
    (0, schedule_1.Interval)(300000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HcmDriftJob.prototype, "run", null);
exports.HcmDriftJob = HcmDriftJob = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        hcm_clock_service_1.HcmClockService,
        hcm_call_log_service_1.HcmCallLogService])
], HcmDriftJob);
//# sourceMappingURL=hcm-drift.job.js.map