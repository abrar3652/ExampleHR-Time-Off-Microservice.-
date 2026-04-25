"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const balance_service_1 = require("../../src/modules/balance/balance.service");
const common_1 = require("@nestjs/common");
const exceptions_1 = require("../../src/domain/exceptions");
const enums_1 = require("../../src/domain/enums");
function iso(ms) {
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
                leaveType: enums_1.LeaveType.ANNUAL,
                totalDays: 20,
                usedDays: 5,
                pendingDays: 2,
                hcmLastUpdatedAt: iso(now - 10_000),
                syncedAt: iso(now - 2 * 60_000),
                createdAt: iso(now - 2 * 60_000),
                updatedAt: iso(now - 2 * 60_000),
            }),
        };
        const fetcher = { getBalance: jest.fn() };
        const dataSource = { transaction: jest.fn() };
        const svc = new balance_service_1.BalanceService(dataSource, repo, fetcher);
        const result = await svc.getOrFetchBalance('emp-001', 'loc-nyc', enums_1.LeaveType.ANNUAL);
        expect(fetcher.getBalance).not.toHaveBeenCalled();
        expect(result.employeeId).toBe('emp-001');
    });
    it('stale balance (synced_at = now - 10min) -> HCM called, local updated', async () => {
        const existing = {
            id: 'b1',
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
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
        };
        const hcm = {
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
        const fetcher = { getBalance: jest.fn().mockResolvedValue(hcm) };
        const manager = {
            getRepository: () => ({
                findOne: jest.fn().mockResolvedValue(existing),
                save: jest.fn().mockImplementation(async (x) => x),
                insert: jest.fn().mockResolvedValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
            }),
            create: (_cls, obj) => obj,
        };
        const dataSource = {
            transaction: jest.fn().mockImplementation(async (fn) => fn(manager)),
        };
        const svc = new balance_service_1.BalanceService(dataSource, repo, fetcher);
        const result = await svc.getOrFetchBalance('emp-001', 'loc-nyc', enums_1.LeaveType.ANNUAL);
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
                leaveType: enums_1.LeaveType.ANNUAL,
                totalDays: 20,
                usedDays: 5,
                pendingDays: 2,
                hcmLastUpdatedAt: iso(now - 10_000),
                syncedAt: iso(now - 10 * 60_000),
                createdAt: iso(now - 10 * 60_000),
                updatedAt: iso(now - 10 * 60_000),
            }),
        };
        const fetcher = {
            getBalance: jest.fn().mockResolvedValue({ success: false, reason: 'TIMEOUT' }),
        };
        const dataSource = { transaction: jest.fn() };
        const svc = new balance_service_1.BalanceService(dataSource, repo, fetcher);
        await expect(svc.getOrFetchBalance('emp-001', 'loc-nyc', enums_1.LeaveType.ANNUAL)).rejects.toBeInstanceOf(exceptions_1.HcmUnavailableException);
    });
    it('HCM fails + fresh balance (found on fallback re-check) -> returns local, logs warning', async () => {
        const fresh = {
            id: 'b1',
            employeeId: 'emp-001',
            locationId: 'loc-nyc',
            leaveType: enums_1.LeaveType.ANNUAL,
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
        };
        const fetcher = {
            getBalance: jest.fn().mockResolvedValue({ success: false, reason: 'NETWORK_ERROR' }),
        };
        const warnSpy = jest.spyOn(common_1.Logger.prototype, 'warn').mockImplementation(() => undefined);
        const dataSource = { transaction: jest.fn() };
        const svc = new balance_service_1.BalanceService(dataSource, repo, fetcher);
        const result = await svc.getOrFetchBalance('emp-001', 'loc-nyc', enums_1.LeaveType.ANNUAL);
        expect(result).toEqual(fresh);
        expect(fetcher.getBalance).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=balance.service.spec.js.map