import { LeaveType } from '../../domain/enums';
import { BalanceService } from './balance.service';
export declare class BalanceController {
    private readonly balanceService;
    constructor(balanceService: BalanceService);
    getBalance(employeeId: string, locationId: string, leaveType: LeaveType): Promise<{
        employeeId: string;
        locationId: string;
        leaveType: LeaveType;
        totalDays: number;
        usedDays: number;
        pendingDays: number;
        availableDays: number;
        syncedAt: string;
        hcmLastUpdatedAt: string;
    }>;
}
