import { LeaveType } from '../../../domain/enums';
export declare class Balance {
    id: string;
    employeeId: string;
    locationId: string;
    leaveType: LeaveType;
    totalDays: number;
    usedDays: number;
    pendingDays: number;
    hcmLastUpdatedAt: string;
    syncedAt: string;
    createdAt: string;
    updatedAt: string;
}
