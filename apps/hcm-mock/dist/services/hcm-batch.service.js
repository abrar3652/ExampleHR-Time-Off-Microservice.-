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
exports.HcmBatchService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const hcm_balance_entity_1 = require("../entities/hcm-balance.entity");
const hcm_batch_snapshot_entity_1 = require("../entities/hcm-batch-snapshot.entity");
const hcm_clock_service_1 = require("./hcm-clock.service");
let HcmBatchService = class HcmBatchService {
    dataSource;
    clock;
    constructor(dataSource, clock) {
        this.dataSource = dataSource;
        this.clock = clock;
    }
    async cleanupExpiredSnapshots() {
        const now = await this.clock.nowIso();
        await this.dataSource
            .getRepository(hcm_batch_snapshot_entity_1.HcmBatchSnapshot)
            .createQueryBuilder()
            .delete()
            .from(hcm_batch_snapshot_entity_1.HcmBatchSnapshot)
            .where('expires_at < :now', { now })
            .execute();
    }
    async createSnapshot(since) {
        await this.cleanupExpiredSnapshots();
        const batchId = `batch-${(0, node_crypto_1.randomUUID)()}`;
        const generatedAt = await this.clock.nowIso();
        const expiresAt = new Date(Date.parse(generatedAt) + 10 * 60 * 1000).toISOString();
        const qb = this.dataSource
            .getRepository(hcm_balance_entity_1.HcmBalance)
            .createQueryBuilder('b')
            .where('b.last_updated_at <= :generatedAt', { generatedAt });
        if (since) {
            qb.andWhere('b.last_updated_at > :since', { since });
        }
        const balances = await qb
            .orderBy('b.employee_id', 'ASC')
            .addOrderBy('b.location_id', 'ASC')
            .addOrderBy('b.leave_type', 'ASC')
            .addOrderBy('b.id', 'ASC')
            .getMany();
        const rows = balances.map((b, idx) => ({
            batchId,
            recordIndex: idx,
            recordData: JSON.stringify({
                employeeId: b.employeeId,
                locationId: b.locationId,
                leaveType: b.leaveType,
                totalDays: b.totalDays,
                usedDays: b.usedDays,
                hcmLastUpdatedAt: b.lastUpdatedAt,
            }),
            generatedAt,
            expiresAt,
        }));
        if (rows.length > 0) {
            await this.dataSource.getRepository(hcm_batch_snapshot_entity_1.HcmBatchSnapshot).insert(rows);
        }
        return { batchId, generatedAt, totalCount: rows.length };
    }
    async getPage(batchId, lastIndex, limit) {
        await this.cleanupExpiredSnapshots();
        const repo = this.dataSource.getRepository(hcm_batch_snapshot_entity_1.HcmBatchSnapshot);
        const totalCount = await repo.countBy({ batchId });
        const first = await repo.findOne({ where: { batchId }, order: { recordIndex: 'ASC' } });
        const generatedAt = first?.generatedAt ?? (await this.clock.nowIso());
        if (totalCount === 0) {
            return { generatedAt, records: [], totalCount: 0, nextLastIndex: null };
        }
        const rows = await repo
            .createQueryBuilder('s')
            .where('s.batch_id = :batchId', { batchId })
            .andWhere('s.record_index > :lastIndex', { lastIndex })
            .orderBy('s.record_index', 'ASC')
            .limit(limit)
            .getMany();
        const records = rows.map((r) => JSON.parse(r.recordData));
        const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
        const nextLastIndex = lastRow ? lastRow.recordIndex : null;
        return { generatedAt, records, totalCount, nextLastIndex };
    }
    encodeCursor(input) {
        return Buffer.from(JSON.stringify(input), 'utf8').toString('base64');
    }
    decodeCursor(cursor) {
        try {
            const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
            if (!parsed.batchId || typeof parsed.lastIndex !== 'number')
                return null;
            return parsed;
        }
        catch {
            return null;
        }
    }
};
exports.HcmBatchService = HcmBatchService;
exports.HcmBatchService = HcmBatchService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        hcm_clock_service_1.HcmClockService])
], HcmBatchService);
//# sourceMappingURL=hcm-batch.service.js.map