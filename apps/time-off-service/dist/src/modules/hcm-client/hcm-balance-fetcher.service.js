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
exports.HcmBalanceFetcher = void 0;
const common_1 = require("@nestjs/common");
const hcm_client_service_1 = require("./hcm-client.service");
let HcmBalanceFetcher = class HcmBalanceFetcher {
    hcm;
    constructor(hcm) {
        this.hcm = hcm;
    }
    getBalance(employeeId, locationId, leaveType) {
        return this.hcm.callHcm(() => this.hcm.axios.get(`/api/hcm/balance/${employeeId}/${locationId}/${leaveType}`), `hcm:balance_get:${employeeId}:${locationId}:${leaveType}`);
    }
};
exports.HcmBalanceFetcher = HcmBalanceFetcher;
exports.HcmBalanceFetcher = HcmBalanceFetcher = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [hcm_client_service_1.HcmClient])
], HcmBalanceFetcher);
//# sourceMappingURL=hcm-balance-fetcher.service.js.map