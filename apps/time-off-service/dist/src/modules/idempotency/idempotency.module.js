"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyModule = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("@nestjs/typeorm");
const idempotency_cleanup_1 = require("./idempotency.cleanup");
const idempotency_interceptor_1 = require("./idempotency.interceptor");
const idempotency_repository_1 = require("./idempotency.repository");
const idempotency_record_entity_1 = require("./entities/idempotency-record.entity");
let IdempotencyModule = class IdempotencyModule {
};
exports.IdempotencyModule = IdempotencyModule;
exports.IdempotencyModule = IdempotencyModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([idempotency_record_entity_1.IdempotencyRecord]), schedule_1.ScheduleModule.forRoot()],
        providers: [idempotency_repository_1.IdempotencyRepository, idempotency_interceptor_1.IdempotencyInterceptor, idempotency_cleanup_1.IdempotencyCleanupJob],
        exports: [idempotency_interceptor_1.IdempotencyInterceptor, idempotency_repository_1.IdempotencyRepository],
    })
], IdempotencyModule);
//# sourceMappingURL=idempotency.module.js.map