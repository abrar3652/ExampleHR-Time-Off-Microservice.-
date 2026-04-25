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
exports.ControlController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const hcm_balance_entity_1 = require("../entities/hcm-balance.entity");
const hcm_call_log_entity_1 = require("../entities/hcm-call-log.entity");
const hcm_transaction_entity_1 = require("../entities/hcm-transaction.entity");
const chaos_service_1 = require("../services/chaos.service");
const hcm_clock_service_1 = require("../services/hcm-clock.service");
let ControlController = class ControlController {
    dataSource;
    chaos;
    clock;
    constructor(dataSource, chaos, clock) {
        this.dataSource = dataSource;
        this.chaos = chaos;
        this.clock = clock;
    }
    async setBehavior(body) {
        const rule = {
            behavior: body.behavior,
            remaining_count: body.count,
            delay_ms: body.delayMs ?? 0,
        };
        if (typeof body.intervalSeconds === 'number') {
            rule.interval_seconds = body.intervalSeconds;
        }
        await this.chaos.setRule(body.endpoint, rule);
        return { ok: true, config: await this.chaos.loadConfig() };
    }
    async setBalance(body) {
        const repo = this.dataSource.getRepository(hcm_balance_entity_1.HcmBalance);
        const existing = await repo.findOne({
            where: {
                employeeId: body.employeeId,
                locationId: body.locationId,
                leaveType: body.leaveType,
            },
        });
        const createdAt = existing?.createdAt ?? (await this.clock.nowIso());
        const row = {
            employeeId: body.employeeId,
            locationId: body.locationId,
            leaveType: body.leaveType,
            totalDays: body.totalDays,
            usedDays: body.usedDays,
            lastUpdatedAt: body.hcmLastUpdatedAt,
            createdAt,
        };
        if (existing?.id) {
            await repo.upsert({ id: existing.id, ...row }, ['employeeId', 'locationId', 'leaveType']);
        }
        else {
            await repo.upsert(row, ['employeeId', 'locationId', 'leaveType']);
        }
        return { ok: true };
    }
    async drift(body) {
        const repo = this.dataSource.getRepository(hcm_balance_entity_1.HcmBalance);
        const existing = await repo.findOne({
            where: {
                employeeId: body.employeeId,
                locationId: body.locationId,
                leaveType: body.leaveType,
            },
        });
        if (!existing) {
            throw new common_1.BadRequestException({
                error: 'INVALID_DIMENSIONS',
                message: `No balance policy found for employee ${body.employeeId} at location ${body.locationId} for leave type ${body.leaveType}`,
            });
        }
        const now = await this.clock.nowIso();
        const usedDays = body.reason === 'year_reset' ? 0 : existing.usedDays;
        await repo.update({ id: existing.id }, {
            totalDays: body.newTotalDays,
            usedDays,
            lastUpdatedAt: now,
        });
        return { ok: true, lastUpdatedAt: now };
    }
    async advanceClock(body) {
        const offsetMs = await this.clock.advance(body.milliseconds);
        const balanceRepo = this.dataSource.getRepository(hcm_balance_entity_1.HcmBalance);
        const balances = await balanceRepo.find();
        for (const balance of balances) {
            const shifted = new Date(Date.parse(balance.lastUpdatedAt) + body.milliseconds).toISOString();
            await balanceRepo.update({ id: balance.id }, { lastUpdatedAt: shifted });
        }
        return { ok: true, offsetMs };
    }
    async getCallLog() {
        const rows = await this.dataSource.getRepository(hcm_call_log_entity_1.HcmCallLog).find({ order: { calledAt: 'ASC' } });
        return rows.map((row) => ({
            endpoint: row.endpoint,
            method: row.method,
            responseStatus: row.responseStatus,
            chaosApplied: row.chaosApplied,
            calledAt: row.calledAt,
        }));
    }
    async reset() {
        await this.dataSource.getRepository(hcm_call_log_entity_1.HcmCallLog).delete({});
        await this.dataSource.getRepository(hcm_transaction_entity_1.HcmTransaction).delete({});
        await this.dataSource.getRepository(hcm_balance_entity_1.HcmBalance).delete({});
        await this.chaos.resetAll();
        await this.clock.reset();
        return { ok: true };
    }
};
exports.ControlController = ControlController;
__decorate([
    (0, common_1.Post)('/behavior'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ControlController.prototype, "setBehavior", null);
__decorate([
    (0, common_1.Post)('/balance'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ControlController.prototype, "setBalance", null);
__decorate([
    (0, common_1.Post)('/drift'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ControlController.prototype, "drift", null);
__decorate([
    (0, common_1.Post)('/advance-clock'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ControlController.prototype, "advanceClock", null);
__decorate([
    (0, common_1.Get)('/call-log'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ControlController.prototype, "getCallLog", null);
__decorate([
    (0, common_1.Post)('/reset'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ControlController.prototype, "reset", null);
exports.ControlController = ControlController = __decorate([
    (0, common_1.Controller)('/__control'),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        chaos_service_1.ChaosService,
        hcm_clock_service_1.HcmClockService])
], ControlController);
//# sourceMappingURL=control.controller.js.map