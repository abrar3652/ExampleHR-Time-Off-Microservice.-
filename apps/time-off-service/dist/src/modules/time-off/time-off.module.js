"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeOffModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const balance_module_1 = require("../balance/balance.module");
const outbox_module_1 = require("../outbox/outbox.module");
const outbox_entity_1 = require("./entities/outbox.entity");
const request_audit_log_entity_1 = require("./entities/request-audit-log.entity");
const time_off_request_entity_1 = require("./entities/time-off-request.entity");
const time_off_controller_1 = require("./time-off.controller");
const time_off_service_1 = require("./time-off.service");
let TimeOffModule = class TimeOffModule {
};
exports.TimeOffModule = TimeOffModule;
exports.TimeOffModule = TimeOffModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([time_off_request_entity_1.TimeOffRequest, outbox_entity_1.Outbox, request_audit_log_entity_1.RequestAuditLog]), balance_module_1.BalanceModule, outbox_module_1.OutboxModule],
        controllers: [time_off_controller_1.TimeOffController],
        providers: [time_off_service_1.TimeOffService],
    })
], TimeOffModule);
//# sourceMappingURL=time-off.module.js.map