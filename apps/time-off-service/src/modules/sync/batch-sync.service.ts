import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import { BalanceChangeSource } from '../../domain/enums';
import { Balance } from '../balance/entities/balance.entity';
import { BalanceChangeLog } from '../balance/entities/balance-change-log.entity';
import { SyncCheckpoint } from './entities/sync-checkpoint.entity';

export interface BatchRecord {
  employeeId: string;
  locationId: string;
  leaveType: string;
  totalDays: number;
  usedDays: number;
  hcmLastUpdatedAt: string;
}

@Injectable()
export class BatchSyncService {
  private readonly logger = new Logger(BatchSyncService.name);

  constructor(private readonly dataSource: DataSource) {}

  private toHcmMillis(value: string): number {
    const normalized = /z$/i.test(value) ? value : `${value}Z`;
    return Date.parse(normalized);
  }

  async applyBatch(records: BatchRecord[], batchId: string, generatedAt: string): Promise<{ processed: number; skipped: number; failed: number }> {
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const record of records) {
      try {
        const result = await this.applyOneRecord(record, batchId);
        if (result === 'skipped') skipped += 1;
        else processed += 1;
      } catch (err) {
        failed += 1;
        this.logger.error({ batchId, record, err }, 'batch record apply failed');
      }
    }

    const now = new Date().toISOString();
    await this.dataSource.getRepository(SyncCheckpoint).save({
      id: 'singleton',
      lastBatchId: batchId,
      lastBatchAt: generatedAt,
      lastRecordCount: processed,
      updatedAt: now,
    });

    return { processed, skipped, failed };
  }

  private async applyOneRecord(record: BatchRecord, batchId: string): Promise<'applied' | 'skipped'> {
    return this.dataSource.transaction(async (manager) => {
      const now = new Date().toISOString();
      const existing = await manager.getRepository(Balance).findOne({
        where: { employeeId: record.employeeId, locationId: record.locationId, leaveType: record.leaveType as any },
      });

      if (!existing) {
        const id = randomUUID();
        await manager.getRepository(Balance).insert({
          id,
          employeeId: record.employeeId,
          locationId: record.locationId,
          leaveType: record.leaveType as any,
          totalDays: record.totalDays,
          usedDays: record.usedDays,
          pendingDays: 0,
          hcmLastUpdatedAt: record.hcmLastUpdatedAt,
          syncedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        await manager.getRepository(BalanceChangeLog).insert([
          {
            id: randomUUID(),
            balanceId: id,
            employeeId: record.employeeId,
            locationId: record.locationId,
            leaveType: record.leaveType as any,
            fieldChanged: 'total_days',
            oldValue: 0,
            newValue: record.totalDays,
            delta: record.totalDays,
            source: BalanceChangeSource.BATCH_SYNC,
            sourceRef: batchId,
            hcmTimestamp: record.hcmLastUpdatedAt,
            createdAt: now,
          },
          {
            id: randomUUID(),
            balanceId: id,
            employeeId: record.employeeId,
            locationId: record.locationId,
            leaveType: record.leaveType as any,
            fieldChanged: 'used_days',
            oldValue: 0,
            newValue: record.usedDays,
            delta: record.usedDays,
            source: BalanceChangeSource.BATCH_SYNC,
            sourceRef: batchId,
            hcmTimestamp: record.hcmLastUpdatedAt,
            createdAt: now,
          },
        ]);
        return 'applied';
      }

      const incomingTs = this.toHcmMillis(record.hcmLastUpdatedAt);
      const existingTs = this.toHcmMillis(existing.hcmLastUpdatedAt);
      if (!Number.isNaN(incomingTs) && !Number.isNaN(existingTs) && incomingTs <= existingTs) {
        return 'skipped';
      }
      if (
        (Number.isNaN(incomingTs) || Number.isNaN(existingTs)) &&
        record.hcmLastUpdatedAt <= existing.hcmLastUpdatedAt
      ) {
        return 'skipped';
      }

      const sum = await manager
        .createQueryBuilder()
        .select('COALESCE(SUM(r.days_requested), 0)', 'pending')
        .from('time_off_request', 'r')
        .where('r.employee_id = :employeeId', { employeeId: record.employeeId })
        .andWhere('r.location_id = :locationId', { locationId: record.locationId })
        .andWhere('r.leave_type = :leaveType', { leaveType: record.leaveType })
        .andWhere("r.state IN ('SUBMITTED','PENDING_HCM','CANCELLING')")
        .getRawOne<{ pending: number }>();
      const pendingDays = Number(sum?.pending ?? 0);

      const oldTotal = existing.totalDays;
      const oldUsed = existing.usedDays;
      await manager.getRepository(Balance).update(
        { id: existing.id },
        {
          totalDays: record.totalDays,
          usedDays: record.usedDays,
          pendingDays,
          hcmLastUpdatedAt: record.hcmLastUpdatedAt,
          syncedAt: now,
          updatedAt: now,
        },
      );

      if (oldTotal !== record.totalDays) {
        await manager.getRepository(BalanceChangeLog).insert({
          id: randomUUID(),
          balanceId: existing.id,
          employeeId: existing.employeeId,
          locationId: existing.locationId,
          leaveType: existing.leaveType,
          fieldChanged: 'total_days',
          oldValue: oldTotal,
          newValue: record.totalDays,
          delta: record.totalDays - oldTotal,
          source: BalanceChangeSource.BATCH_SYNC,
          sourceRef: batchId,
          hcmTimestamp: record.hcmLastUpdatedAt,
          createdAt: now,
        });
      }
      if (oldUsed !== record.usedDays) {
        await manager.getRepository(BalanceChangeLog).insert({
          id: randomUUID(),
          balanceId: existing.id,
          employeeId: existing.employeeId,
          locationId: existing.locationId,
          leaveType: existing.leaveType,
          fieldChanged: 'used_days',
          oldValue: oldUsed,
          newValue: record.usedDays,
          delta: record.usedDays - oldUsed,
          source: BalanceChangeSource.BATCH_SYNC,
          sourceRef: batchId,
          hcmTimestamp: record.hcmLastUpdatedAt,
          createdAt: now,
        });
      }
      return 'applied';
    });
  }
}

