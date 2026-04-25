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
exports.Balance = void 0;
const typeorm_1 = require("typeorm");
const enums_1 = require("../../../domain/enums");
let Balance = class Balance {
    id;
    employeeId;
    locationId;
    leaveType;
    totalDays;
    usedDays;
    pendingDays;
    hcmLastUpdatedAt;
    syncedAt;
    createdAt;
    updatedAt;
};
exports.Balance = Balance;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'text' }),
    __metadata("design:type", String)
], Balance.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'employee_id', type: 'text' }),
    __metadata("design:type", String)
], Balance.prototype, "employeeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'location_id', type: 'text' }),
    __metadata("design:type", String)
], Balance.prototype, "locationId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'leave_type', type: 'text' }),
    __metadata("design:type", String)
], Balance.prototype, "leaveType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_days', type: 'real' }),
    __metadata("design:type", Number)
], Balance.prototype, "totalDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'used_days', type: 'real', default: 0 }),
    __metadata("design:type", Number)
], Balance.prototype, "usedDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'pending_days', type: 'real', default: 0 }),
    __metadata("design:type", Number)
], Balance.prototype, "pendingDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'hcm_last_updated_at', type: 'text' }),
    __metadata("design:type", String)
], Balance.prototype, "hcmLastUpdatedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'synced_at', type: 'text' }),
    __metadata("design:type", String)
], Balance.prototype, "syncedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_at', type: 'text' }),
    __metadata("design:type", String)
], Balance.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'updated_at', type: 'text' }),
    __metadata("design:type", String)
], Balance.prototype, "updatedAt", void 0);
exports.Balance = Balance = __decorate([
    (0, typeorm_1.Entity)({ name: 'balance' }),
    (0, typeorm_1.Unique)(['employeeId', 'locationId', 'leaveType']),
    (0, typeorm_1.Index)('idx_balance_employee', ['employeeId'])
], Balance);
//# sourceMappingURL=balance.entity.js.map