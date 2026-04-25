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
exports.TimeOffRequest = void 0;
const typeorm_1 = require("typeorm");
const enums_1 = require("../../../domain/enums");
let TimeOffRequest = class TimeOffRequest {
    id;
    idempotencyKey;
    employeeId;
    locationId;
    leaveType;
    startDate;
    endDate;
    daysRequested;
    state;
    lastOutboxEvent;
    hcmExternalRef;
    hcmTransactionId;
    hcmResponseCode;
    hcmResponseBody;
    rejectionReason;
    failureReason;
    retryCount;
    createdBy;
    approvedBy;
    createdAt;
    updatedAt;
};
exports.TimeOffRequest = TimeOffRequest;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'text' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'idempotency_key', type: 'text', unique: true }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "idempotencyKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'employee_id', type: 'text' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "employeeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'location_id', type: 'text' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "locationId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'leave_type', type: 'text' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "leaveType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'start_date', type: 'text' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "startDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'end_date', type: 'text' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "endDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'days_requested', type: 'real' }),
    __metadata("design:type", Number)
], TimeOffRequest.prototype, "daysRequested", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "state", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_outbox_event', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], TimeOffRequest.prototype, "lastOutboxEvent", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'hcm_external_ref', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], TimeOffRequest.prototype, "hcmExternalRef", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'hcm_transaction_id', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], TimeOffRequest.prototype, "hcmTransactionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'hcm_response_code', type: 'integer', nullable: true }),
    __metadata("design:type", Object)
], TimeOffRequest.prototype, "hcmResponseCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'hcm_response_body', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], TimeOffRequest.prototype, "hcmResponseBody", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'rejection_reason', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], TimeOffRequest.prototype, "rejectionReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'failure_reason', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], TimeOffRequest.prototype, "failureReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'retry_count', type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], TimeOffRequest.prototype, "retryCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_by', type: 'text' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'approved_by', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], TimeOffRequest.prototype, "approvedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_at', type: 'text' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'updated_at', type: 'text' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "updatedAt", void 0);
exports.TimeOffRequest = TimeOffRequest = __decorate([
    (0, typeorm_1.Entity)({ name: 'time_off_request' }),
    (0, typeorm_1.Index)('idx_tor_employee', ['employeeId']),
    (0, typeorm_1.Index)('idx_tor_state', ['state']),
    (0, typeorm_1.Index)('idx_tor_idempotency', ['idempotencyKey'])
], TimeOffRequest);
//# sourceMappingURL=time-off-request.entity.js.map