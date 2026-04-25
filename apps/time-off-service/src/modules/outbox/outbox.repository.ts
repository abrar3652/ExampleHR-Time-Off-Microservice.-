import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { In } from 'typeorm';

import { Outbox } from '../time-off/entities/outbox.entity';

@Injectable()
export class OutboxRepository {
  constructor(private readonly dataSource: DataSource) {}

  async claimPending(limit = 5): Promise<Outbox[]> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    try {
      await qr.query('BEGIN IMMEDIATE');
      const now = new Date().toISOString();
      await qr.query(
        `UPDATE outbox
         SET status='PROCESSING', last_attempted_at=?
         WHERE id IN (
           SELECT id FROM outbox
           WHERE status='PENDING' AND process_after <= ?
           ORDER BY created_at ASC
           LIMIT ?
         )`,
        [now, now, limit],
      );
      const rows = (await qr.query(
        "SELECT id FROM outbox WHERE status='PROCESSING' AND last_attempted_at=? ORDER BY created_at ASC",
        [now],
      )) as Array<{ id: string }>;
      await qr.query('COMMIT');
      if (rows.length === 0) return [];
      return this.dataSource.getRepository(Outbox).find({
        where: { id: In(rows.map((r) => r.id)) },
        order: { createdAt: 'ASC' },
      });
    } catch (e) {
      await qr.query('ROLLBACK');
      throw e;
    } finally {
      await qr.release();
    }
  }

  async resetStuckProcessing(): Promise<void> {
    const cutoff = new Date(Date.now() - 30_000).toISOString();
    await this.dataSource
      .getRepository(Outbox)
      .createQueryBuilder()
      .update()
      .set({ status: 'PENDING', processAfter: new Date().toISOString() })
      .where("status = 'PROCESSING' AND last_attempted_at < :cutoff", { cutoff })
      .execute();
  }

  async markDone(id: string): Promise<void> {
    await this.dataSource.getRepository(Outbox).update({ id }, { status: 'DONE' });
  }

  async scheduleRetry(id: string, attempt: number, reason: string): Promise<void> {
    const delaySeconds = Math.pow(2, attempt);
    const processAfter = new Date(Date.now() + delaySeconds * 1000).toISOString();
    await this.dataSource.getRepository(Outbox).update(
      { id },
      {
        status: 'PENDING',
        processAfter,
        attempts: attempt,
        lastError: reason,
      },
    );
  }

  async markFailed(id: string, reason: string): Promise<void> {
    await this.dataSource.getRepository(Outbox).update({ id }, { status: 'FAILED', lastError: reason });
  }

  async countPendingOrProcessing(): Promise<number> {
    return this.dataSource.getRepository(Outbox).count({
      where: { status: In(['PENDING', 'PROCESSING']) },
    });
  }
}

