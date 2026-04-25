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
exports.ReconciliationLog = void 0;
const typeorm_1 = require("typeorm");
let ReconciliationLog = class ReconciliationLog {
    id;
    runId;
    employeeId;
    locationId;
    leaveType;
    driftField;
    localValue;
    hcmValue;
    adjustedLocal;
    drift;
    resolved;
    resolution;
    resolvedAt;
    createdAt;
};
exports.ReconciliationLog = ReconciliationLog;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'text' }),
    __metadata("design:type", String)
], ReconciliationLog.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'run_id', type: 'text' }),
    __metadata("design:type", String)
], ReconciliationLog.prototype, "runId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'employee_id', type: 'text' }),
    __metadata("design:type", String)
], ReconciliationLog.prototype, "employeeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'location_id', type: 'text' }),
    __metadata("design:type", String)
], ReconciliationLog.prototype, "locationId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'leave_type', type: 'text' }),
    __metadata("design:type", String)
], ReconciliationLog.prototype, "leaveType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'drift_field', type: 'text' }),
    __metadata("design:type", String)
], ReconciliationLog.prototype, "driftField", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'local_value', type: 'real' }),
    __metadata("design:type", Number)
], ReconciliationLog.prototype, "localValue", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'hcm_value', type: 'real' }),
    __metadata("design:type", Number)
], ReconciliationLog.prototype, "hcmValue", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'adjusted_local', type: 'real' }),
    __metadata("design:type", Number)
], ReconciliationLog.prototype, "adjustedLocal", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'real' }),
    __metadata("design:type", Number)
], ReconciliationLog.prototype, "drift", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], ReconciliationLog.prototype, "resolved", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], ReconciliationLog.prototype, "resolution", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'resolved_at', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], ReconciliationLog.prototype, "resolvedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_at', type: 'text' }),
    __metadata("design:type", String)
], ReconciliationLog.prototype, "createdAt", void 0);
exports.ReconciliationLog = ReconciliationLog = __decorate([
    (0, typeorm_1.Entity)({ name: 'reconciliation_log' })
], ReconciliationLog);
//# sourceMappingURL=reconciliation-log.entity.js.map