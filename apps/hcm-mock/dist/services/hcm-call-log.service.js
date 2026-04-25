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
exports.HcmCallLogService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const hcm_call_log_entity_1 = require("../entities/hcm-call-log.entity");
const hcm_clock_service_1 = require("./hcm-clock.service");
let HcmCallLogService = class HcmCallLogService {
    dataSource;
    clock;
    constructor(dataSource, clock) {
        this.dataSource = dataSource;
        this.clock = clock;
    }
    async append(input) {
        await this.dataSource.getRepository(hcm_call_log_entity_1.HcmCallLog).insert({
            endpoint: input.endpoint,
            method: input.method,
            requestBody: input.requestBody == null ? null : JSON.stringify(input.requestBody),
            responseStatus: input.responseStatus,
            responseBody: input.responseBody == null ? null : JSON.stringify(input.responseBody),
            chaosApplied: input.chaosApplied ?? null,
            durationMs: input.durationMs,
            calledAt: await this.clock.nowIso(),
        });
    }
};
exports.HcmCallLogService = HcmCallLogService;
exports.HcmCallLogService = HcmCallLogService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        hcm_clock_service_1.HcmClockService])
], HcmCallLogService);
//# sourceMappingURL=hcm-call-log.service.js.map