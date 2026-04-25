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
exports.BalanceRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const balance_entity_1 = require("./entities/balance.entity");
let BalanceRepository = class BalanceRepository {
    dataSource;
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    findByDimensions(employeeId, locationId, leaveType) {
        return this.dataSource.getRepository(balance_entity_1.Balance).findOne({ where: { employeeId, locationId, leaveType } });
    }
    async upsert(data) {
        await this.dataSource.getRepository(balance_entity_1.Balance).save(data);
        return data;
    }
    lockRow(manager, employeeId, locationId, leaveType) {
        return manager.getRepository(balance_entity_1.Balance).findOne({ where: { employeeId, locationId, leaveType } });
    }
};
exports.BalanceRepository = BalanceRepository;
exports.BalanceRepository = BalanceRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], BalanceRepository);
//# sourceMappingURL=balance.repository.js.map