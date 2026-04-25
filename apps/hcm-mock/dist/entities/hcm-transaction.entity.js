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
exports.HcmTransaction = void 0;
const typeorm_1 = require("typeorm");
let HcmTransaction = class HcmTransaction {
    id;
    externalRef;
    employeeId;
    locationId;
    leaveType;
    transactionType;
    days;
    startDate;
    endDate;
    status;
    reversedBy;
    createdAt;
};
exports.HcmTransaction = HcmTransaction;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], HcmTransaction.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'external_ref', type: 'text', unique: true }),
    __metadata("design:type", String)
], HcmTransaction.prototype, "externalRef", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'employee_id', type: 'text' }),
    __metadata("design:type", String)
], HcmTransaction.prototype, "employeeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'location_id', type: 'text' }),
    __metadata("design:type", String)
], HcmTransaction.prototype, "locationId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'leave_type', type: 'text' }),
    __metadata("design:type", String)
], HcmTransaction.prototype, "leaveType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'transaction_type', type: 'text' }),
    __metadata("design:type", String)
], HcmTransaction.prototype, "transactionType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'days', type: 'real' }),
    __metadata("design:type", Number)
], HcmTransaction.prototype, "days", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'start_date', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], HcmTransaction.prototype, "startDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'end_date', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], HcmTransaction.prototype, "endDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'status', type: 'text' }),
    __metadata("design:type", String)
], HcmTransaction.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'reversed_by', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], HcmTransaction.prototype, "reversedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_at', type: 'text' }),
    __metadata("design:type", String)
], HcmTransaction.prototype, "createdAt", void 0);
exports.HcmTransaction = HcmTransaction = __decorate([
    (0, typeorm_1.Entity)({ name: 'hcm_transaction' }),
    (0, typeorm_1.Index)('idx_hcm_txn_ext_ref', ['externalRef']),
    (0, typeorm_1.Index)('idx_hcm_txn_employee', ['employeeId'])
], HcmTransaction);
//# sourceMappingURL=hcm-transaction.entity.js.map