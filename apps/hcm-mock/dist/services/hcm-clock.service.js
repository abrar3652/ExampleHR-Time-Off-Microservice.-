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
exports.HcmClockService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const hcm_internal_clock_entity_1 = require("../entities/hcm-internal-clock.entity");
let HcmClockService = class HcmClockService {
    dataSource;
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async nowIso() {
        const clock = await this.dataSource.getRepository(hcm_internal_clock_entity_1.HcmInternalClock).findOneBy({ id: 'singleton' });
        const offsetMs = clock?.offsetMs ?? 0;
        return new Date(Date.now() + offsetMs).toISOString();
    }
    async advance(milliseconds) {
        const repo = this.dataSource.getRepository(hcm_internal_clock_entity_1.HcmInternalClock);
        const existing = await repo.findOneBy({ id: 'singleton' });
        const offsetMs = (existing?.offsetMs ?? 0) + milliseconds;
        await repo.upsert({ id: 'singleton', offsetMs }, ['id']);
        return offsetMs;
    }
    async reset() {
        await this.dataSource.getRepository(hcm_internal_clock_entity_1.HcmInternalClock).upsert({ id: 'singleton', offsetMs: 0 }, ['id']);
    }
};
exports.HcmClockService = HcmClockService;
exports.HcmClockService = HcmClockService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], HcmClockService);
//# sourceMappingURL=hcm-clock.service.js.map