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
exports.RequestAuditLog = void 0;
const typeorm_1 = require("typeorm");
const enums_1 = require("../../../domain/enums");
let RequestAuditLog = class RequestAuditLog {
    id;
    requestId;
    fromState;
    toState;
    actor;
    reason;
    metadata;
    createdAt;
};
exports.RequestAuditLog = RequestAuditLog;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'text' }),
    __metadata("design:type", String)
], RequestAuditLog.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'request_id', type: 'text' }),
    __metadata("design:type", String)
], RequestAuditLog.prototype, "requestId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'from_state', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], RequestAuditLog.prototype, "fromState", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'to_state', type: 'text' }),
    __metadata("design:type", String)
], RequestAuditLog.prototype, "toState", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], RequestAuditLog.prototype, "actor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], RequestAuditLog.prototype, "reason", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], RequestAuditLog.prototype, "metadata", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_at', type: 'text' }),
    __metadata("design:type", String)
], RequestAuditLog.prototype, "createdAt", void 0);
exports.RequestAuditLog = RequestAuditLog = __decorate([
    (0, typeorm_1.Entity)({ name: 'request_audit_log' }),
    (0, typeorm_1.Index)('idx_ral_request', ['requestId'])
], RequestAuditLog);
//# sourceMappingURL=request-audit-log.entity.js.map