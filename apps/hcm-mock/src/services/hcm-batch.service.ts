import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import { HcmBalance } from '../entities/hcm-balance.entity';
import { HcmBatchSnapshot } from '../entities/hcm-batch-snapshot.entity';
import { HcmClockService } from './hcm-clock.service';

export interface HcmBatchRecord {
  employeeId: string;
  locationId: string;
  leaveType: string;
  totalDays: number;
  usedDays: number;
  hcmLastUpdatedAt: string;
}

@Injectable()
export class HcmBatchService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: HcmClockService,
  ) {}

  async cleanupExpiredSnapshots(): Promise<void> {
    const now = await this.clock.nowIso();
    await this.dataSource
      .getRepository(HcmBatchSnapshot)
      .createQueryBuilder()
      .delete()
      .from(HcmBatchSnapshot)
      .where('expires_at < :now', { now })
      .execute();
  }

  async createSnapshot(since?: string): Promise<{ batchId: string; generatedAt: string; totalCount: number }> {
    await this.cleanupExpiredSnapshots();
    const batchId = `batch-${randomUUID()}`;
    const generatedAt = await this.clock.nowIso();
    const expiresAt = new Date(Date.parse(generatedAt) + 10 * 60 * 1000).toISOString();

    const qb = this.dataSource
      .getRepository(HcmBalance)
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
      await this.dataSource.getRepository(HcmBatchSnapshot).insert(rows);
    }

    return { batchId, generatedAt, totalCount: rows.length };
  }

  async getPage(
    batchId: string,
    lastIndex: number,
    limit: number,
  ): Promise<{ generatedAt: string; records: HcmBatchRecord[]; totalCount: number; nextLastIndex: number | null }> {
    await this.cleanupExpiredSnapshots();
    const repo = this.dataSource.getRepository(HcmBatchSnapshot);
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

    const records = rows.map((r) => JSON.parse(r.recordData) as HcmBatchRecord);
    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
    const nextLastIndex = lastRow ? lastRow.recordIndex : null;
    return { generatedAt, records, totalCount, nextLastIndex };
  }

  encodeCursor(input: { batchId: string; lastIndex: number }): string {
    return Buffer.from(JSON.stringify(input), 'utf8').toString('base64');
  }

  decodeCursor(cursor: string): { batchId: string; lastIndex: number } | null {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
        batchId: string;
        lastIndex: number;
      };
      if (!parsed.batchId || typeof parsed.lastIndex !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
