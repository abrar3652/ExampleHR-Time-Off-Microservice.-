"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalanceModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const hcm_client_module_1 = require("../hcm-client/hcm-client.module");
const balance_controller_1 = require("./balance.controller");
const balance_repository_1 = require("./balance.repository");
const balance_service_1 = require("./balance.service");
const balance_change_log_entity_1 = require("./entities/balance-change-log.entity");
const balance_entity_1 = require("./entities/balance.entity");
let BalanceModule = class BalanceModule {
};
exports.BalanceModule = BalanceModule;
exports.BalanceModule = BalanceModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([balance_entity_1.Balance, balance_change_log_entity_1.BalanceChangeLog]), hcm_client_module_1.HcmClientModule],
        controllers: [balance_controller_1.BalanceController],
        providers: [balance_repository_1.BalanceRepository, balance_service_1.BalanceService],
        exports: [balance_service_1.BalanceService, balance_repository_1.BalanceRepository],
    })
], BalanceModule);
//# sourceMappingURL=balance.module.js.map