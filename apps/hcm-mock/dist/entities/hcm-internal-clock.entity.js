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
exports.HcmInternalClock = void 0;
const typeorm_1 = require("typeorm");
let HcmInternalClock = class HcmInternalClock {
    id;
    offsetMs;
};
exports.HcmInternalClock = HcmInternalClock;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'text' }),
    __metadata("design:type", String)
], HcmInternalClock.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'offset_ms', type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], HcmInternalClock.prototype, "offsetMs", void 0);
exports.HcmInternalClock = HcmInternalClock = __decorate([
    (0, typeorm_1.Entity)({ name: 'hcm_internal_clock' })
], HcmInternalClock);
//# sourceMappingURL=hcm-internal-clock.entity.js.map