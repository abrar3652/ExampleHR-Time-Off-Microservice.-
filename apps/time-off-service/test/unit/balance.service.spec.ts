import { BalanceService } from '../../src/modules/balance/balance.service';
import type { HcmResult } from '../../src/modules/hcm-client/types';
import { Logger } from '@nestjs/common';
import { HcmUnavailableException } from '../../src/domain/exceptions';
import { LeaveType } from '../../src/domain/enums';

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

describe('BalanceService.getOrFetchBalance', () => {
  const now = Date.parse('2025-01-15T10:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('fresh balance (synced_at = now - 2min) -> HCM NOT called', async () => {
    const repo = {
      findByDimensions: jest.fn().mockResolvedValue({
        id: 'b1',
        employeeId: 'emp-001',
        locationId: 'loc-nyc',
        leaveType: LeaveType.ANNUAL,
        totalDays: 20,
        usedDays: 5,
        pendingDays: 2,
        hcmLastUpdatedAt: iso(now - 10_000),
        syncedAt: iso(now - 2 * 60_000),
        createdAt: iso(now - 2 * 60_000),
        updatedAt: iso(now - 2 * 60_000),
      }),
    } as any;

    const fetcher = { getBalance: jest.fn() } as any;

    const dataSource = { transaction: jest.fn() } as any;

    const svc = new BalanceService(dataSource, repo, fetcher);
    const result = await svc.getOrFetchBalance('emp-001', 'loc-nyc', LeaveType.ANNUAL);

    expect(fetcher.getBalance).not.toHaveBeenCalled();
    expect(result.employeeId).toBe('emp-001');
  });

  it('stale balance (synced_at = now - 10min) -> HCM called, local updated', async () => {
    const existing = {
      id: 'b1',
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      totalDays: 20,
      usedDays: 5,
      pendingDays: 2,
      hcmLastUpdatedAt: iso(now - 100_000),
      syncedAt: iso(now - 10 * 60_000),
      createdAt: iso(now - 10 * 60_000),
      updatedAt: iso(now - 10 * 60_000),
    };

    const repo = {
      findByDimensions: jest.fn().mockResolvedValue(existing),
    } as any;

    const hcm: HcmResult<any> = {
      success: true,
      statusCode: 200,
      data: {
        employeeId: 'emp-001',
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        totalDays: 25,
        usedDays: 7,
        lastUpdatedAt: iso(now - 1_000),
      },
    };

    const fetcher = { getBalance: jest.fn().mockResolvedValue(hcm) } as any;

    const manager = {
      getRepository: () => ({
        findOne: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation(async (x) => x),
        insert: jest.fn().mockResolvedValue(undefined),
      }),
      create: (_cls: any, obj: any) => obj,
    };

    const dataSource = {
      transaction: jest.fn().mockImplementation(async (_mode: any, fn: any) => fn(manager)),
    } as any;

    const svc = new BalanceService(dataSource, repo, fetcher);
    const result = await svc.getOrFetchBalance('emp-001', 'loc-nyc', LeaveType.ANNUAL);

    expect(fetcher.getBalance).toHaveBeenCalledTimes(1);
    expect(result.totalDays).toBe(25);
    expect(result.usedDays).toBe(7);
    expect(result.syncedAt).toBe(iso(now));
  });

  it('HCM fails + stale balance -> throws HcmUnavailableException', async () => {
    const repo = {
      findByDimensions: jest.fn().mockResolvedValue({
        id: 'b1',
        employeeId: 'emp-001',
        locationId: 'loc-nyc',
        leaveType: LeaveType.ANNUAL,
        totalDays: 20,
        usedDays: 5,
        pendingDays: 2,
        hcmLastUpdatedAt: iso(now - 10_000),
        syncedAt: iso(now - 10 * 60_000),
        createdAt: iso(now - 10 * 60_000),
        updatedAt: iso(now - 10 * 60_000),
      }),
    } as any;

    const fetcher = {
      getBalance: jest.fn().mockResolvedValue({ success: false, reason: 'TIMEOUT' }),
    } as any;

    const dataSource = { transaction: jest.fn() } as any;
    const svc = new BalanceService(dataSource, repo, fetcher);

    await expect(svc.getOrFetchBalance('emp-001', 'loc-nyc', LeaveType.ANNUAL)).rejects.toBeInstanceOf(
      HcmUnavailableException,
    );
  });

  it('HCM fails + fresh balance (found on fallback re-check) -> returns local, logs warning', async () => {
    const fresh = {
      id: 'b1',
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      totalDays: 20,
      usedDays: 5,
      pendingDays: 2,
      hcmLastUpdatedAt: iso(now - 10_000),
      syncedAt: iso(now - 2 * 60_000),
      createdAt: iso(now - 2 * 60_000),
      updatedAt: iso(now - 2 * 60_000),
    };

    const repo = {
      findByDimensions: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(fresh),
    } as any;

    const fetcher = {
      getBalance: jest.fn().mockResolvedValue({ success: false, reason: 'NETWORK_ERROR' }),
    } as any;

    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const dataSource = { transaction: jest.fn() } as any;
    const svc = new BalanceService(dataSource, repo, fetcher);

    const result = await svc.getOrFetchBalance('emp-001', 'loc-nyc', LeaveType.ANNUAL);
    expect(result).toEqual(fresh);
    expect(fetcher.getBalance).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

