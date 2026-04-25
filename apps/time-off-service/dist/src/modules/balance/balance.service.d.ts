import { DataSource, type EntityManager } from 'typeorm';
import { LeaveType } from '../../domain/enums';
import { HcmBalanceFetcher } from '../hcm-client/hcm-balance-fetcher.service';
import { Balance } from './entities/balance.entity';
import { BalanceRepository } from './balance.repository';
export declare class BalanceService {
    private readonly dataSource;
    private readonly repo;
    private readonly hcmBalanceFetcher;
    private readonly logger;
    constructor(dataSource: DataSource, repo: BalanceRepository, hcmBalanceFetcher: HcmBalanceFetcher);
    getOrFetchBalance(employeeId: string, locationId: string, leaveType: LeaveType): Promise<Balance>;
    withBalanceLock<T>(employeeId: string, locationId: string, leaveType: LeaveType, fn: (manager: EntityManager, balance: Balance) => Promise<T>): Promise<T>;
    private isFresh;
    private writeRealTimeSyncChangeLogs;
    private withImmediateTransaction;
}
