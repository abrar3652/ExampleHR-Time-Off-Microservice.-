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
exports.HcmDeductController = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const hcm_balance_entity_1 = require("../entities/hcm-balance.entity");
const hcm_transaction_entity_1 = require("../entities/hcm-transaction.entity");
const chaos_service_1 = require("../services/chaos.service");
const hcm_call_log_service_1 = require("../services/hcm-call-log.service");
const hcm_clock_service_1 = require("../services/hcm-clock.service");
let HcmDeductController = class HcmDeductController {
    dataSource;
    chaos;
    clock;
    callLog;
    constructor(dataSource, chaos, clock, callLog) {
        this.dataSource = dataSource;
        this.chaos = chaos;
        this.clock = clock;
        this.callLog = callLog;
    }
    async deduct(body, res) {
        const started = Date.now();
        const endpoint = 'deduct';
        let chaosRule = null;
        try {
            chaosRule = await this.chaos.shouldApplyChaos(endpoint);
            await this.chaos.applyBaseLatency();
            await this.chaos.applyDelay(chaosRule);
            if (chaosRule?.behavior === 'timeout') {
                await this.chaos.forceTimeoutClose(10000);
                await this.callLog.append({
                    endpoint,
                    method: 'POST',
                    requestBody: body,
                    responseStatus: 0,
                    responseBody: { error: 'TIMEOUT' },
                    chaosApplied: chaosRule.behavior,
                    durationMs: Date.now() - started,
                });
                res.destroy();
                return;
            }
            const txRepo = this.dataSource.getRepository(hcm_transaction_entity_1.HcmTransaction);
            const existing = await txRepo.findOne({ where: { externalRef: body.externalRef } });
            // D1: externalRef idempotency check.
            if (existing) {
                const responseBody = {
                    error: 'DUPLICATE_EXTERNAL_REF',
                    externalRef: body.externalRef,
                    message: 'This externalRef has already been processed',
                    existingTransaction: existing.id,
                };
                await this.callLog.append({
                    endpoint,
                    method: 'POST',
                    requestBody: body,
                    responseStatus: 409,
                    responseBody,
                    chaosApplied: chaosRule?.behavior ?? null,
                    durationMs: Date.now() - started,
                });
                res.status(409).json(responseBody);
                return;
            }
            const forced = await this.chaos.injectBehavior(chaosRule, {
                endpoint,
                externalRef: body.externalRef,
            });
            if (forced && forced.status !== 409) {
                await this.callLog.append({
                    endpoint,
                    method: 'POST',
                    requestBody: body,
                    responseStatus: forced.status,
                    responseBody: forced.body,
                    chaosApplied: chaosRule?.behavior ?? null,
                    durationMs: Date.now() - started,
                });
                res.status(forced.status).json(forced.body);
                return;
            }
            const balanceRepo = this.dataSource.getRepository(hcm_balance_entity_1.HcmBalance);
            const balance = await balanceRepo.findOne({
                where: {
                    employeeId: body.employeeId,
                    locationId: body.locationId,
                    leaveType: body.leaveType,
                },
            });
            // D4: dimensions always validated.
            if (!balance) {
                const responseBody = {
                    error: 'INVALID_DIMENSIONS',
                    message: `No balance policy found for employee ${body.employeeId} at location ${body.locationId} for leave type ${body.leaveType}`,
                };
                await this.callLog.append({
                    endpoint,
                    method: 'POST',
                    requestBody: body,
                    responseStatus: 400,
                    responseBody,
                    chaosApplied: chaosRule?.behavior ?? null,
                    durationMs: Date.now() - started,
                });
                res.status(400).json(responseBody);
                return;
            }
            const skipBalanceValidation = chaosRule?.behavior === 'invalid_validation';
            const available = balance.totalDays - balance.usedDays;
            // D2: validate available balance unless invalid_validation chaos is active.
            if (!skipBalanceValidation && body.days > available) {
                const responseBody = {
                    error: 'INSUFFICIENT_BALANCE',
                    available,
                    requested: body.days,
                    message: 'Employee does not have sufficient balance',
                };
                await this.callLog.append({
                    endpoint,
                    method: 'POST',
                    requestBody: body,
                    responseStatus: 422,
                    responseBody,
                    chaosApplied: chaosRule?.behavior ?? null,
                    durationMs: Date.now() - started,
                });
                res.status(422).json(responseBody);
                return;
            }
            const hcmTransactionId = (0, node_crypto_1.randomUUID)();
            const now = await this.clock.nowIso();
            const projectedUsed = balance.usedDays + body.days;
            // D3: apply transaction atomically, except silent_success mode.
            await this.dataSource.transaction(async (manager) => {
                await manager.getRepository(hcm_transaction_entity_1.HcmTransaction).insert({
                    id: hcmTransactionId,
                    externalRef: body.externalRef,
                    employeeId: body.employeeId,
                    locationId: body.locationId,
                    leaveType: body.leaveType,
                    transactionType: 'DEDUCT',
                    days: body.days,
                    startDate: body.startDate,
                    endDate: body.endDate,
                    status: chaosRule?.behavior === 'silent_success' ? 'SILENT_FAILED' : 'APPLIED',
                    reversedBy: null,
                    createdAt: now,
                });
                if (chaosRule?.behavior !== 'silent_success') {
                    await manager.getRepository(hcm_balance_entity_1.HcmBalance).update({ id: balance.id }, {
                        usedDays: projectedUsed,
                        lastUpdatedAt: now,
                    });
                }
            });
            const responseBody = {
                externalRef: body.externalRef,
                hcmTransactionId,
                newUsedDays: projectedUsed,
                newTotalDays: balance.totalDays,
                lastUpdatedAt: now,
                message: 'Deduction applied successfully',
            };
            await this.callLog.append({
                endpoint,
                method: 'POST',
                requestBody: body,
                responseStatus: 200,
                responseBody,
                chaosApplied: chaosRule?.behavior ?? null,
                durationMs: Date.now() - started,
            });
            res.status(200).json(responseBody);
        }
        catch {
            const responseBody = { error: 'INTERNAL_SERVER_ERROR', message: 'Unexpected mock HCM error' };
            await this.callLog.append({
                endpoint,
                method: 'POST',
                requestBody: body,
                responseStatus: 500,
                responseBody,
                chaosApplied: chaosRule?.behavior ?? null,
                durationMs: Date.now() - started,
            });
            res.status(500).json(responseBody);
        }
    }
};
exports.HcmDeductController = HcmDeductController;
__decorate([
    (0, common_1.Post)('/deduct'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], HcmDeductController.prototype, "deduct", null);
exports.HcmDeductController = HcmDeductController = __decorate([
    (0, common_1.Controller)('/api/hcm/timeoff'),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        chaos_service_1.ChaosService,
        hcm_clock_service_1.HcmClockService,
        hcm_call_log_service_1.HcmCallLogService])
], HcmDeductController);
//# sourceMappingURL=hcm-deduct.controller.js.map