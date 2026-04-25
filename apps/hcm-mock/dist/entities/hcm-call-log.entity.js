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
exports.HcmCallLog = void 0;
const typeorm_1 = require("typeorm");
let HcmCallLog = class HcmCallLog {
    id;
    endpoint;
    method;
    requestBody;
    responseStatus;
    responseBody;
    chaosApplied;
    durationMs;
    calledAt;
};
exports.HcmCallLog = HcmCallLog;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], HcmCallLog.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], HcmCallLog.prototype, "endpoint", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], HcmCallLog.prototype, "method", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'request_body', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], HcmCallLog.prototype, "requestBody", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'response_status', type: 'integer' }),
    __metadata("design:type", Number)
], HcmCallLog.prototype, "responseStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'response_body', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], HcmCallLog.prototype, "responseBody", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'chaos_applied', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], HcmCallLog.prototype, "chaosApplied", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'duration_ms', type: 'integer' }),
    __metadata("design:type", Number)
], HcmCallLog.prototype, "durationMs", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'called_at', type: 'text' }),
    __metadata("design:type", String)
], HcmCallLog.prototype, "calledAt", void 0);
exports.HcmCallLog = HcmCallLog = __decorate([
    (0, typeorm_1.Entity)({ name: 'hcm_call_log' })
], HcmCallLog);
//# sourceMappingURL=hcm-call-log.entity.js.map