import { BalanceChangeSource, LeaveType } from '../../../domain/enums';
export declare class BalanceChangeLog {
    id: string;
    balanceId: string;
    employeeId: string;
    locationId: string;
    leaveType: LeaveType;
    fieldChanged: 'used_days' | 'pending_days' | 'total_days';
    oldValue: number;
    newValue: number;
    delta: number;
    source: BalanceChangeSource;
    sourceRef: string | null;
    hcmTimestamp: string | null;
    createdAt: string;
}
