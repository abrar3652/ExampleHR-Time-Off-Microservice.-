import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';

import { BalanceChangeSource, LeaveType } from '../../domain/enums';
import { BalanceNotFoundError, HcmUnavailableException } from '../../domain/exceptions';
import { HcmBalanceFetcher } from '../hcm-client/hcm-balance-fetcher.service';
import { BalanceChangeLog } from './entities/balance-change-log.entity';
import { Balance } from './entities/balance.entity';
import { BalanceRepository } from './balance.repository';

const TTL_MS = 5 * 60 * 1000;

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly repo: BalanceRepository,
    private readonly hcmBalanceFetcher: HcmBalanceFetcher,
  ) {}

  async getOrFetchBalance(employeeId: string, locationId: string, leaveType: LeaveType): Promise<Balance> {
    const existing = await this.repo.findByDimensions(employeeId, locationId, leaveType);
    if (existing && this.isFresh(existing.syncedAt)) return existing;

    const hcmResult = await this.hcmBalanceFetcher.getBalance(employeeId, locationId, leaveType);

    if (!hcmResult.success) {
      const fallback = existing ?? (await this.repo.findByDimensions(employeeId, locationId, leaveType));
      if (fallback && this.isFresh(fallback.syncedAt)) {
        this.logger.warn(
          { employeeId, locationId, leaveType, reason: hcmResult.reason },
          'HCM fetch failed; returning fresh cached balance',
        );
        return fallback;
      }
      throw new HcmUnavailableException(
        'Balance data is stale and HCM is unreachable. Please retry later.',
      );
    }

    if (hcmResult.statusCode === 404) {
      throw new BalanceNotFoundError(
        `No balance found for employee ${employeeId} at location ${locationId} for leave type ${leaveType}`,
      );
    }

    const now = new Date().toISOString();

    return this.withImmediateTransaction(async (manager) => {
      const current = await manager
        .getRepository(Balance)
        .findOne({ where: { employeeId, locationId, leaveType } });

      const next: Balance = current
        ? {
            ...current,
            totalDays: hcmResult.data.totalDays,
            usedDays: hcmResult.data.usedDays,
            hcmLastUpdatedAt: hcmResult.data.lastUpdatedAt,
            syncedAt: now,
            updatedAt: now,
          }
        : {
            id: randomUUID(),
            employeeId,
            locationId,
            leaveType,
            totalDays: hcmResult.data.totalDays,
            usedDays: hcmResult.data.usedDays,
            pendingDays: 0,
            hcmLastUpdatedAt: hcmResult.data.lastUpdatedAt,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
          };

      if (current) {
        await manager.getRepository(Balance).update(
          { id: current.id },
          {
            totalDays: next.totalDays,
            usedDays: next.usedDays,
            hcmLastUpdatedAt: next.hcmLastUpdatedAt,
            syncedAt: next.syncedAt,
            updatedAt: next.updatedAt,
          },
        );
      } else {
        await manager.getRepository(Balance).insert(next);
      }
      await this.writeRealTimeSyncChangeLogs(manager, current, next);
      return next;
    });
  }

  async withBalanceLock<T>(
    employeeId: string,
    locationId: string,
    leaveType: LeaveType,
    fn: (manager: EntityManager, balance: Balance) => Promise<T>,
  ): Promise<T> {
    return this.withImmediateTransaction(async (manager) => {
      let balance = await manager
        .getRepository(Balance)
        .findOne({ where: { employeeId, locationId, leaveType } });

      if (!balance) {
        const hcmResult = await this.hcmBalanceFetcher.getBalance(employeeId, locationId, leaveType);
        if (!hcmResult.success) throw new HcmUnavailableException();
        if (hcmResult.statusCode === 404) {
          throw new BalanceNotFoundError(
            `No balance found for employee ${employeeId} at location ${locationId} for leave type ${leaveType}`,
          );
        }

        const now = new Date().toISOString();
        balance = manager.create(Balance, {
          id: randomUUID(),
          employeeId,
          locationId,
          leaveType,
          totalDays: hcmResult.data.totalDays,
          usedDays: hcmResult.data.usedDays,
          pendingDays: 0,
          hcmLastUpdatedAt: hcmResult.data.lastUpdatedAt,
          syncedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        await manager.getRepository(Balance).insert(balance);
      }

      return fn(manager, balance);
    });
  }

  private isFresh(syncedAt: string): boolean {
    return Date.now() - new Date(syncedAt).getTime() < TTL_MS;
  }

  private async writeRealTimeSyncChangeLogs(
    manager: EntityManager,
    before: Balance | null,
    after: Balance,
  ): Promise<void> {
    const now = new Date().toISOString();
    const rows: BalanceChangeLog[] = [];

    const pushIfChanged = (
      fieldChanged: BalanceChangeLog['fieldChanged'],
      oldValue: number,
      newValue: number,
    ) => {
      if (oldValue === newValue) return;
      rows.push(
        manager.create(BalanceChangeLog, {
          id: randomUUID(),
          balanceId: after.id,
          employeeId: after.employeeId,
          locationId: after.locationId,
          leaveType: after.leaveType,
          fieldChanged,
          oldValue,
          newValue,
          delta: newValue - oldValue,
          source: BalanceChangeSource.REAL_TIME_SYNC,
          sourceRef: null,
          hcmTimestamp: after.hcmLastUpdatedAt,
          createdAt: now,
        }),
      );
    };

    pushIfChanged('total_days', before?.totalDays ?? 0, after.totalDays);
    pushIfChanged('used_days', before?.usedDays ?? 0, after.usedDays);

    if (rows.length > 0) {
      await manager.getRepository(BalanceChangeLog).insert(rows);
    }
  }

  private async withImmediateTransaction<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) => fn(manager));
  }
}

