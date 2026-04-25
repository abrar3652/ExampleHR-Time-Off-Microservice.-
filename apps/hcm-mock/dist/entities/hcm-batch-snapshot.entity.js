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
exports.HcmBatchSnapshot = void 0;
const typeorm_1 = require("typeorm");
let HcmBatchSnapshot = class HcmBatchSnapshot {
    batchId;
    recordIndex;
    recordData;
    generatedAt;
    expiresAt;
};
exports.HcmBatchSnapshot = HcmBatchSnapshot;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ name: 'batch_id', type: 'text' }),
    __metadata("design:type", String)
], HcmBatchSnapshot.prototype, "batchId", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)({ name: 'record_index', type: 'integer' }),
    __metadata("design:type", Number)
], HcmBatchSnapshot.prototype, "recordIndex", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'record_data', type: 'text' }),
    __metadata("design:type", String)
], HcmBatchSnapshot.prototype, "recordData", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'generated_at', type: 'text' }),
    __metadata("design:type", String)
], HcmBatchSnapshot.prototype, "generatedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'expires_at', type: 'text' }),
    __metadata("design:type", String)
], HcmBatchSnapshot.prototype, "expiresAt", void 0);
exports.HcmBatchSnapshot = HcmBatchSnapshot = __decorate([
    (0, typeorm_1.Entity)({ name: 'hcm_batch_snapshot' })
], HcmBatchSnapshot);
//# sourceMappingURL=hcm-batch-snapshot.entity.js.map