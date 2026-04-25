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
exports.SyncCheckpoint = void 0;
const typeorm_1 = require("typeorm");
let SyncCheckpoint = class SyncCheckpoint {
    id;
    lastBatchId;
    lastBatchAt;
    lastRecordCount;
    updatedAt;
};
exports.SyncCheckpoint = SyncCheckpoint;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'text', default: 'singleton' }),
    __metadata("design:type", String)
], SyncCheckpoint.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_batch_id', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], SyncCheckpoint.prototype, "lastBatchId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_batch_at', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], SyncCheckpoint.prototype, "lastBatchAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_record_count', type: 'integer', nullable: true }),
    __metadata("design:type", Object)
], SyncCheckpoint.prototype, "lastRecordCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'updated_at', type: 'text' }),
    __metadata("design:type", String)
], SyncCheckpoint.prototype, "updatedAt", void 0);
exports.SyncCheckpoint = SyncCheckpoint = __decorate([
    (0, typeorm_1.Entity)({ name: 'sync_checkpoint' })
], SyncCheckpoint);
//# sourceMappingURL=sync-checkpoint.entity.js.map