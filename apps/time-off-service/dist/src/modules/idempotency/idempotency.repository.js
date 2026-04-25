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
exports.IdempotencyRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const idempotency_record_entity_1 = require("./entities/idempotency-record.entity");
let IdempotencyRepository = class IdempotencyRepository {
    dataSource;
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    findByKey(key) {
        return this.dataSource.getRepository(idempotency_record_entity_1.IdempotencyRecord).findOne({ where: { idempotencyKey: key } });
    }
    insertInProgress(key, requestBody, expiresAt, createdAt) {
        return this.dataSource
            .getRepository(idempotency_record_entity_1.IdempotencyRecord)
            .insert({
            idempotencyKey: key,
            status: 'IN_PROGRESS',
            requestBody,
            expiresAt,
            createdAt,
        })
            .then(() => undefined);
    }
    async markComplete(key, statusCode, responseBody) {
        await this.dataSource.getRepository(idempotency_record_entity_1.IdempotencyRecord).update({ idempotencyKey: key }, {
            status: 'COMPLETE',
            responseStatus: statusCode,
            responseBody,
        });
    }
    async delete(key) {
        await this.dataSource.getRepository(idempotency_record_entity_1.IdempotencyRecord).delete({ idempotencyKey: key });
    }
    async deleteExpired(nowIso) {
        const result = await this.dataSource
            .getRepository(idempotency_record_entity_1.IdempotencyRecord)
            .createQueryBuilder()
            .delete()
            .where('expires_at < :nowIso', { nowIso })
            .execute();
        return result.affected ?? 0;
    }
};
exports.IdempotencyRepository = IdempotencyRepository;
exports.IdempotencyRepository = IdempotencyRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], IdempotencyRepository);
//# sourceMappingURL=idempotency.repository.js.map