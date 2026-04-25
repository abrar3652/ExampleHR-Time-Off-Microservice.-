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
exports.IdempotencyRecord = void 0;
const typeorm_1 = require("typeorm");
let IdempotencyRecord = class IdempotencyRecord {
    idempotencyKey;
    status;
    responseStatus;
    responseBody;
    requestBody;
    expiresAt;
    createdAt;
};
exports.IdempotencyRecord = IdempotencyRecord;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ name: 'idempotency_key', type: 'text' }),
    __metadata("design:type", String)
], IdempotencyRecord.prototype, "idempotencyKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', default: 'IN_PROGRESS' }),
    __metadata("design:type", String)
], IdempotencyRecord.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'response_status', type: 'integer', nullable: true }),
    __metadata("design:type", Object)
], IdempotencyRecord.prototype, "responseStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'response_body', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], IdempotencyRecord.prototype, "responseBody", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'request_body', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], IdempotencyRecord.prototype, "requestBody", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'expires_at', type: 'text' }),
    __metadata("design:type", String)
], IdempotencyRecord.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_at', type: 'text' }),
    __metadata("design:type", String)
], IdempotencyRecord.prototype, "createdAt", void 0);
exports.IdempotencyRecord = IdempotencyRecord = __decorate([
    (0, typeorm_1.Entity)({ name: 'idempotency_record' }),
    (0, typeorm_1.Index)('idx_ir_expires', ['expiresAt'])
], IdempotencyRecord);
//# sourceMappingURL=idempotency-record.entity.js.map