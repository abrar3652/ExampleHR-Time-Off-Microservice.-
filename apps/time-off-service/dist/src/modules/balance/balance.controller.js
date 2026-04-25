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
exports.BalanceController = void 0;
const common_1 = require("@nestjs/common");
const enums_1 = require("../../domain/enums");
const balance_service_1 = require("./balance.service");
let BalanceController = class BalanceController {
    balanceService;
    constructor(balanceService) {
        this.balanceService = balanceService;
    }
    async getBalance(employeeId, locationId, leaveType) {
        const b = await this.balanceService.getOrFetchBalance(employeeId, locationId, leaveType);
        return {
            employeeId: b.employeeId,
            locationId: b.locationId,
            leaveType: b.leaveType,
            totalDays: b.totalDays,
            usedDays: b.usedDays,
            pendingDays: b.pendingDays,
            availableDays: b.totalDays - b.usedDays - b.pendingDays,
            syncedAt: b.syncedAt,
            hcmLastUpdatedAt: b.hcmLastUpdatedAt,
        };
    }
};
exports.BalanceController = BalanceController;
__decorate([
    (0, common_1.Get)('/balances/:employeeId/:locationId/:leaveType'),
    __param(0, (0, common_1.Param)('employeeId')),
    __param(1, (0, common_1.Param)('locationId')),
    __param(2, (0, common_1.Param)('leaveType')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], BalanceController.prototype, "getBalance", null);
exports.BalanceController = BalanceController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [balance_service_1.BalanceService])
], BalanceController);
//# sourceMappingURL=balance.controller.js.map