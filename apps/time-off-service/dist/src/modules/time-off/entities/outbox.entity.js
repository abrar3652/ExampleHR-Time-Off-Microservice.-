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
exports.Outbox = void 0;
const typeorm_1 = require("typeorm");
const enums_1 = require("../../../domain/enums");
let Outbox = class Outbox {
    id;
    eventType;
    payload;
    requestId;
    status;
    attempts;
    lastAttemptedAt;
    lastError;
    createdAt;
    processAfter;
};
exports.Outbox = Outbox;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'text' }),
    __metadata("design:type", String)
], Outbox.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'event_type', type: 'text' }),
    __metadata("design:type", String)
], Outbox.prototype, "eventType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], Outbox.prototype, "payload", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'request_id', type: 'text' }),
    __metadata("design:type", String)
], Outbox.prototype, "requestId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', default: 'PENDING' }),
    __metadata("design:type", String)
], Outbox.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], Outbox.prototype, "attempts", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_attempted_at', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Outbox.prototype, "lastAttemptedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_error', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Outbox.prototype, "lastError", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_at', type: 'text' }),
    __metadata("design:type", String)
], Outbox.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'process_after', type: 'text' }),
    __metadata("design:type", String)
], Outbox.prototype, "processAfter", void 0);
exports.Outbox = Outbox = __decorate([
    (0, typeorm_1.Entity)({ name: 'outbox' }),
    (0, typeorm_1.Index)('idx_outbox_pending', ['status', 'processAfter'])
], Outbox);
//# sourceMappingURL=outbox.entity.js.map