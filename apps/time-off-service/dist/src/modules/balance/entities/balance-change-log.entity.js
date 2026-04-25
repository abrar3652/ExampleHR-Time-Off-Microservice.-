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
exports.BalanceChangeLog = void 0;
const typeorm_1 = require("typeorm");
const enums_1 = require("../../../domain/enums");
let BalanceChangeLog = class BalanceChangeLog {
    id;
    balanceId;
    employeeId;
    locationId;
    leaveType;
    fieldChanged;
    oldValue;
    newValue;
    delta;
    source;
    sourceRef;
    hcmTimestamp;
    createdAt;
};
exports.BalanceChangeLog = BalanceChangeLog;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'text' }),
    __metadata("design:type", String)
], BalanceChangeLog.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'balance_id', type: 'text' }),
    __metadata("design:type", String)
], BalanceChangeLog.prototype, "balanceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'employee_id', type: 'text' }),
    __metadata("design:type", String)
], BalanceChangeLog.prototype, "employeeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'location_id', type: 'text' }),
    __metadata("design:type", String)
], BalanceChangeLog.prototype, "locationId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'leave_type', type: 'text' }),
    __metadata("design:type", String)
], BalanceChangeLog.prototype, "leaveType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'field_changed', type: 'text' }),
    __metadata("design:type", String)
], BalanceChangeLog.prototype, "fieldChanged", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'old_value', type: 'real' }),
    __metadata("design:type", Number)
], BalanceChangeLog.prototype, "oldValue", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'new_value', type: 'real' }),
    __metadata("design:type", Number)
], BalanceChangeLog.prototype, "newValue", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'delta', type: 'real' }),
    __metadata("design:type", Number)
], BalanceChangeLog.prototype, "delta", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source', type: 'text' }),
    __metadata("design:type", String)
], BalanceChangeLog.prototype, "source", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source_ref', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], BalanceChangeLog.prototype, "sourceRef", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'hcm_timestamp', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], BalanceChangeLog.prototype, "hcmTimestamp", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_at', type: 'text' }),
    __metadata("design:type", String)
], BalanceChangeLog.prototype, "createdAt", void 0);
exports.BalanceChangeLog = BalanceChangeLog = __decorate([
    (0, typeorm_1.Entity)({ name: 'balance_change_log' }),
    (0, typeorm_1.Index)('idx_bcl_balance', ['balanceId']),
    (0, typeorm_1.Index)('idx_bcl_employee', ['employeeId'])
], BalanceChangeLog);
//# sourceMappingURL=balance-change-log.entity.js.map