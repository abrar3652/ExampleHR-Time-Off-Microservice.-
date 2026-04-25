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
exports.HcmReverseController = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const hcm_balance_entity_1 = require("../entities/hcm-balance.entity");
const hcm_transaction_entity_1 = require("../entities/hcm-transaction.entity");
const chaos_service_1 = require("../services/chaos.service");
const hcm_call_log_service_1 = require("../services/hcm-call-log.service");
const hcm_clock_service_1 = require("../services/hcm-clock.service");
let HcmReverseController = class HcmReverseController {
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
    async reverse(body, res) {
        const started = Date.now();
        const endpoint = 'reverse';
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
            const forced = await this.chaos.injectBehavior(chaosRule, {
                endpoint,
                externalRef: body.externalRef,
            });
            if (forced) {
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
            const txRepo = this.dataSource.getRepository(hcm_transaction_entity_1.HcmTransaction);
            const original = await txRepo.findOne({ where: { id: body.hcmTransactionId } });
            // R1: original transaction must exist.
            if (!original) {
                const responseBody = {
                    error: 'TRANSACTION_NOT_FOUND',
                    hcmTransactionId: body.hcmTransactionId,
                    message: 'No HCM transaction found with the given ID',
                };
                await this.callLog.append({
                    endpoint,
                    method: 'POST',
                    requestBody: body,
                    responseStatus: 404,
                    responseBody,
                    chaosApplied: chaosRule?.behavior ?? null,
                    durationMs: Date.now() - started,
                });
                res.status(404).json(responseBody);
                return;
            }
            // R2: no double reversal.
            if (original.status === 'REVERSED') {
                const responseBody = {
                    error: 'ALREADY_REVERSED',
                    message: 'This transaction has already been reversed',
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
            const reversalTransactionId = (0, node_crypto_1.randomUUID)();
            const now = await this.clock.nowIso();
            let restoredDays = 0;
            let resultingUsedDays = 0;
            await this.dataSource.transaction(async (manager) => {
                const balanceRepo = manager.getRepository(hcm_balance_entity_1.HcmBalance);
                const currentBalance = await balanceRepo.findOne({
                    where: {
                        employeeId: original.employeeId,
                        locationId: original.locationId,
                        leaveType: original.leaveType,
                    },
                });
                if (!currentBalance) {
                    throw new Error('BALANCE_NOT_FOUND_FOR_TRANSACTION');
                }
                if (original.status === 'SILENT_FAILED') {
                    // R3: reversal of silent_failed restores 0 days.
                    restoredDays = 0;
                    resultingUsedDays = currentBalance.usedDays;
                }
                else {
                    // R4: apply reversal and clamp at 0.
                    restoredDays = original.days;
                    resultingUsedDays = Math.max(0, currentBalance.usedDays - original.days);
                    await balanceRepo.update({ id: currentBalance.id }, {
                        usedDays: resultingUsedDays,
                        lastUpdatedAt: now,
                    });
                }
                await manager.getRepository(hcm_transaction_entity_1.HcmTransaction).update({ id: original.id }, {
                    status: 'REVERSED',
                    reversedBy: reversalTransactionId,
                });
                await manager.getRepository(hcm_transaction_entity_1.HcmTransaction).insert({
                    id: reversalTransactionId,
                    externalRef: `${body.externalRef}:reverse:${reversalTransactionId}`,
                    employeeId: original.employeeId,
                    locationId: original.locationId,
                    leaveType: original.leaveType,
                    transactionType: 'REVERSE',
                    days: restoredDays,
                    startDate: null,
                    endDate: null,
                    status: 'APPLIED',
                    reversedBy: null,
                    createdAt: now,
                });
            });
            const responseBody = {
                externalRef: body.externalRef,
                reversalTransactionId,
                restoredDays,
                newUsedDays: resultingUsedDays,
                lastUpdatedAt: now,
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
exports.HcmReverseController = HcmReverseController;
__decorate([
    (0, common_1.Post)('/reverse'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], HcmReverseController.prototype, "reverse", null);
exports.HcmReverseController = HcmReverseController = __decorate([
    (0, common_1.Controller)('/api/hcm/timeoff'),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        chaos_service_1.ChaosService,
        hcm_clock_service_1.HcmClockService,
        hcm_call_log_service_1.HcmCallLogService])
], HcmReverseController);
//# sourceMappingURL=hcm-reverse.controller.js.map