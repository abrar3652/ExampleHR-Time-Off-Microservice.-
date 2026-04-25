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
exports.OutboxRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const typeorm_2 = require("typeorm");
const outbox_entity_1 = require("../time-off/entities/outbox.entity");
let OutboxRepository = class OutboxRepository {
    dataSource;
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async claimPending(limit = 5) {
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        try {
            await qr.query('BEGIN IMMEDIATE');
            const now = new Date().toISOString();
            await qr.query(`UPDATE outbox
         SET status='PROCESSING', last_attempted_at=?
         WHERE id IN (
           SELECT id FROM outbox
           WHERE status='PENDING' AND process_after <= ?
           ORDER BY created_at ASC
           LIMIT ?
         )`, [now, now, limit]);
            const rows = (await qr.query("SELECT id FROM outbox WHERE status='PROCESSING' AND last_attempted_at=? ORDER BY created_at ASC", [now]));
            await qr.query('COMMIT');
            if (rows.length === 0)
                return [];
            return this.dataSource.getRepository(outbox_entity_1.Outbox).find({
                where: { id: (0, typeorm_2.In)(rows.map((r) => r.id)) },
                order: { createdAt: 'ASC' },
            });
        }
        catch (e) {
            await qr.query('ROLLBACK');
            throw e;
        }
        finally {
            await qr.release();
        }
    }
    async resetStuckProcessing() {
        const cutoff = new Date(Date.now() - 30_000).toISOString();
        await this.dataSource
            .getRepository(outbox_entity_1.Outbox)
            .createQueryBuilder()
            .update()
            .set({ status: 'PENDING', processAfter: new Date().toISOString() })
            .where("status = 'PROCESSING' AND last_attempted_at < :cutoff", { cutoff })
            .execute();
    }
    async markDone(id) {
        await this.dataSource.getRepository(outbox_entity_1.Outbox).update({ id }, { status: 'DONE' });
    }
    async scheduleRetry(id, attempt, reason) {
        const delaySeconds = Math.pow(2, attempt);
        const processAfter = new Date(Date.now() + delaySeconds * 1000).toISOString();
        await this.dataSource.getRepository(outbox_entity_1.Outbox).update({ id }, {
            status: 'PENDING',
            processAfter,
            attempts: attempt,
            lastError: reason,
        });
    }
    async markFailed(id, reason) {
        await this.dataSource.getRepository(outbox_entity_1.Outbox).update({ id }, { status: 'FAILED', lastError: reason });
    }
};
exports.OutboxRepository = OutboxRepository;
exports.OutboxRepository = OutboxRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], OutboxRepository);
//# sourceMappingURL=outbox.repository.js.map