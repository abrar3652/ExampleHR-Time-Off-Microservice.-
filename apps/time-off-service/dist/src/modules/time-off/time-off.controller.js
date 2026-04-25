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
exports.TimeOffController = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
const time_off_service_1 = require("./time-off.service");
let TimeOffController = class TimeOffController {
    timeOffService;
    constructor(timeOffService) {
        this.timeOffService = timeOffService;
    }
    createRequest(dto, employeeId, idempotencyKey) {
        return this.timeOffService.createRequest(dto, employeeId, idempotencyKey);
    }
    getRequestById(requestId) {
        return this.timeOffService.getRequestById(requestId);
    }
    cancel(requestId, employeeId) {
        return this.timeOffService.cancelRequest(requestId, employeeId);
    }
};
exports.TimeOffController = TimeOffController;
__decorate([
    (0, common_1.Post)('/requests'),
    (0, common_1.HttpCode)(202),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-employee-id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], TimeOffController.prototype, "createRequest", null);
__decorate([
    (0, common_2.Get)('/requests/:requestId'),
    __param(0, (0, common_2.Param)('requestId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TimeOffController.prototype, "getRequestById", null);
__decorate([
    (0, common_1.Post)('/requests/:requestId/cancel'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_2.Param)('requestId')),
    __param(1, (0, common_1.Headers)('x-employee-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TimeOffController.prototype, "cancel", null);
exports.TimeOffController = TimeOffController = __decorate([
    (0, common_1.Controller)('/time-off'),
    __metadata("design:paramtypes", [time_off_service_1.TimeOffService])
], TimeOffController);
//# sourceMappingURL=time-off.controller.js.map