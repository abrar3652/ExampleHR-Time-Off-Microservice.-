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
exports.HcmBalanceController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const hcm_balance_entity_1 = require("../entities/hcm-balance.entity");
const chaos_service_1 = require("../services/chaos.service");
const hcm_call_log_service_1 = require("../services/hcm-call-log.service");
let HcmBalanceController = class HcmBalanceController {
    dataSource;
    chaos;
    callLog;
    constructor(dataSource, chaos, callLog) {
        this.dataSource = dataSource;
        this.chaos = chaos;
        this.callLog = callLog;
    }
    async getBalance(employeeId, locationId, leaveType, res) {
        const started = Date.now();
        const endpoint = 'balance_get';
        const requestBody = { employeeId, locationId, leaveType };
        let chaosRule = null;
        try {
            chaosRule = await this.chaos.shouldApplyChaos(endpoint);
            await this.chaos.applyBaseLatency();
            await this.chaos.applyDelay(chaosRule);
            if (chaosRule?.behavior === 'timeout') {
                await this.chaos.forceTimeoutClose(10000);
                await this.callLog.append({
                    endpoint,
                    method: 'GET',
                    requestBody,
                    responseStatus: 0,
                    responseBody: { error: 'TIMEOUT' },
                    chaosApplied: chaosRule.behavior,
                    durationMs: Date.now() - started,
                });
                res.destroy();
                return;
            }
            const chaosResponse = await this.chaos.injectBehavior(chaosRule, { endpoint });
            if (chaosResponse) {
                await this.callLog.append({
                    endpoint,
                    method: 'GET',
                    requestBody,
                    responseStatus: chaosResponse.status,
                    responseBody: chaosResponse.body,
                    chaosApplied: chaosRule?.behavior ?? null,
                    durationMs: Date.now() - started,
                });
                res.status(chaosResponse.status).json(chaosResponse.body);
                return;
            }
            const balance = await this.dataSource.getRepository(hcm_balance_entity_1.HcmBalance).findOne({
                where: { employeeId, locationId, leaveType },
            });
            if (!balance) {
                const body = {
                    error: 'EMPLOYEE_BALANCE_NOT_FOUND',
                    message: 'No balance record found for the given dimensions',
                };
                await this.callLog.append({
                    endpoint,
                    method: 'GET',
                    requestBody,
                    responseStatus: 404,
                    responseBody: body,
                    chaosApplied: chaosRule?.behavior ?? null,
                    durationMs: Date.now() - started,
                });
                res.status(404).json(body);
                return;
            }
            const body = {
                employeeId: balance.employeeId,
                locationId: balance.locationId,
                leaveType: balance.leaveType,
                totalDays: balance.totalDays,
                usedDays: balance.usedDays,
                lastUpdatedAt: balance.lastUpdatedAt,
            };
            await this.callLog.append({
                endpoint,
                method: 'GET',
                requestBody,
                responseStatus: 200,
                responseBody: body,
                chaosApplied: chaosRule?.behavior ?? null,
                durationMs: Date.now() - started,
            });
            res.status(200).json(body);
        }
        catch (err) {
            const body = { error: 'INTERNAL_SERVER_ERROR', message: 'Unexpected mock HCM error' };
            await this.callLog.append({
                endpoint,
                method: 'GET',
                requestBody,
                responseStatus: 500,
                responseBody: body,
                chaosApplied: chaosRule?.behavior ?? null,
                durationMs: Date.now() - started,
            });
            res.status(500).json(body);
        }
    }
};
exports.HcmBalanceController = HcmBalanceController;
__decorate([
    (0, common_1.Get)('/:employeeId/:locationId/:leaveType'),
    __param(0, (0, common_1.Param)('employeeId')),
    __param(1, (0, common_1.Param)('locationId')),
    __param(2, (0, common_1.Param)('leaveType')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], HcmBalanceController.prototype, "getBalance", null);
exports.HcmBalanceController = HcmBalanceController = __decorate([
    (0, common_1.Controller)('/api/hcm/balance'),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        chaos_service_1.ChaosService,
        hcm_call_log_service_1.HcmCallLogService])
], HcmBalanceController);
//# sourceMappingURL=hcm-balance.controller.js.map