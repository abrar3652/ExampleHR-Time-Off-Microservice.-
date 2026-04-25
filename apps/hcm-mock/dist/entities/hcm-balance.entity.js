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
exports.HcmBalance = void 0;
const typeorm_1 = require("typeorm");
let HcmBalance = class HcmBalance {
    id;
    employeeId;
    locationId;
    leaveType;
    totalDays;
    usedDays;
    lastUpdatedAt;
    createdAt;
};
exports.HcmBalance = HcmBalance;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], HcmBalance.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'employee_id', type: 'text' }),
    __metadata("design:type", String)
], HcmBalance.prototype, "employeeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'location_id', type: 'text' }),
    __metadata("design:type", String)
], HcmBalance.prototype, "locationId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'leave_type', type: 'text' }),
    __metadata("design:type", String)
], HcmBalance.prototype, "leaveType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_days', type: 'real' }),
    __metadata("design:type", Number)
], HcmBalance.prototype, "totalDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'used_days', type: 'real', default: 0 }),
    __metadata("design:type", Number)
], HcmBalance.prototype, "usedDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_updated_at', type: 'text' }),
    __metadata("design:type", String)
], HcmBalance.prototype, "lastUpdatedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_at', type: 'text' }),
    __metadata("design:type", String)
], HcmBalance.prototype, "createdAt", void 0);
exports.HcmBalance = HcmBalance = __decorate([
    (0, typeorm_1.Entity)({ name: 'hcm_balance' }),
    (0, typeorm_1.Unique)(['employeeId', 'locationId', 'leaveType']),
    (0, typeorm_1.Index)('idx_hcm_balance_employee', ['employeeId'])
], HcmBalance);
//# sourceMappingURL=hcm-balance.entity.js.map