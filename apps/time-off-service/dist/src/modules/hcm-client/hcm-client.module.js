"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HcmClientModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const hcm_balance_fetcher_service_1 = require("./hcm-balance-fetcher.service");
const hcm_client_service_1 = require("./hcm-client.service");
const hcm_deduction_writer_service_1 = require("./hcm-deduction-writer.service");
let HcmClientModule = class HcmClientModule {
};
exports.HcmClientModule = HcmClientModule;
exports.HcmClientModule = HcmClientModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        providers: [hcm_client_service_1.HcmClient, hcm_balance_fetcher_service_1.HcmBalanceFetcher, hcm_deduction_writer_service_1.HcmDeductionWriter],
        exports: [hcm_client_service_1.HcmClient, hcm_balance_fetcher_service_1.HcmBalanceFetcher, hcm_deduction_writer_service_1.HcmDeductionWriter],
    })
], HcmClientModule);
//# sourceMappingURL=hcm-client.module.js.map