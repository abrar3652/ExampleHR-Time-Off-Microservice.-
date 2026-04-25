import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import { BalanceChangeSource } from '../../domain/enums';
import { Balance } from '../balance/entities/balance.entity';
import { BalanceChangeLog } from '../balance/entities/balance-change-log.entity';
import { HcmBalanceResponse } from '../hcm-client/types';
import { HcmClient } from '../hcm-client/hcm-client.service';
import { ReconciliationLog } from './entities/reconciliation-log.entity';

@Injectable()
export class ReconciliationWorker {
  private readonly logger = new Logger(ReconciliationWorker.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly hcmClient: HcmClient,
  ) {}

  @Cron('*/15 * * * *')
  async run(): Promise<void> {
    await this.runReconciliation(false);
  }

  async runReconciliation(force = false): Promise<void> {
    if (!force && process.env.DISABLE_BACKGROUND_WORKERS === '1') return;
    const runId = randomUUID();
    this.logger.log(JSON.stringify({ event: 'reconciliation_start', runId }));

    const balances = await this.dataSource.getRepository(Balance).find();
    let drifts = 0;
    let corrected = 0;
    for (const local of balances) {
      const hcmResult = await this.hcmClient.callHcm<HcmBalanceResponse>(
        () =>
          this.hcmClient.axios.get(
            `/api/hcm/balance/${local.employeeId}/${local.locationId}/${local.leaveType}`,
          ),
        `reconcile:${local.employeeId}:${local.locationId}:${local.leaveType}`,
      );
      if (!hcmResult.success) {
        this.logger.warn(
          JSON.stringify({ event: 'reconciliation_hcm_fetch_failed', runId, employee: local.employeeId, reason: 'hcm_fetch_failed' }),
        );
        continue;
      }

      const totalDrift = hcmResult.data.totalDays - local.totalDays;
      if (Math.abs(totalDrift) > 0.001) {
        drifts += 1;
        const now = new Date().toISOString();
        const driftEntry = this.dataSource.getRepository(ReconciliationLog).create({
          id: randomUUID(),
          runId,
          employeeId: local.employeeId,
          locationId: local.locationId,
          leaveType: local.leaveType,
          driftField: 'total_days',
          localValue: local.totalDays,
          hcmValue: hcmResult.data.totalDays,
          adjustedLocal: local.totalDays,
          drift: totalDrift,
          resolved: 0,
          resolution: 'MANUAL_REVIEW',
          resolvedAt: null,
          createdAt: now,
        });
        await this.dataSource.getRepository(ReconciliationLog).save(driftEntry);

        const driftAgeMinutes = (Date.now() - new Date(local.syncedAt).getTime()) / 60000;
        const canAutoCorrect =
          driftAgeMinutes > 15 && hcmResult.data.lastUpdatedAt > local.hcmLastUpdatedAt;

        if (canAutoCorrect) {
          await this.dataSource.transaction(async (manager) => {
            await manager.getRepository(Balance).update(
              { id: local.id },
              {
                totalDays: hcmResult.data.totalDays,
                hcmLastUpdatedAt: hcmResult.data.lastUpdatedAt,
                updatedAt: now,
              },
            );
            await manager.getRepository(BalanceChangeLog).insert({
              id: randomUUID(),
              balanceId: local.id,
              employeeId: local.employeeId,
              locationId: local.locationId,
              leaveType: local.leaveType,
              fieldChanged: 'total_days',
              oldValue: local.totalDays,
              newValue: hcmResult.data.totalDays,
              delta: hcmResult.data.totalDays - local.totalDays,
              source: BalanceChangeSource.AUTO_RECONCILE,
              sourceRef: runId,
              hcmTimestamp: hcmResult.data.lastUpdatedAt,
              createdAt: now,
            });
            await manager.getRepository(ReconciliationLog).update(
              { id: driftEntry.id },
              { resolved: 1, resolution: 'AUTO_CORRECTED', resolvedAt: now },
            );
          });
          corrected += 1;
        }
      }

      const adjustedLocalUsed = local.usedDays + local.pendingDays;
      const usedDrift = hcmResult.data.usedDays - adjustedLocalUsed;
      if (Math.abs(usedDrift) > 0.001) {
        drifts += 1;
        await this.dataSource.getRepository(ReconciliationLog).insert({
          id: randomUUID(),
          runId,
          employeeId: local.employeeId,
          locationId: local.locationId,
          leaveType: local.leaveType,
          driftField: 'used_days',
          localValue: local.usedDays,
          hcmValue: hcmResult.data.usedDays,
          adjustedLocal: adjustedLocalUsed,
          drift: usedDrift,
          resolved: 0,
          resolution: 'MANUAL_REVIEW',
          resolvedAt: null,
          createdAt: new Date().toISOString(),
        });
      }
    }

    this.logger.log(
      JSON.stringify({
        event: 'reconciliation_complete',
        runId,
        checked: balances.length,
        drifts,
        corrected,
      }),
    );
  }
}

