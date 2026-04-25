export type HcmTransactionType = 'DEDUCT' | 'REVERSE';
export type HcmTransactionStatus = 'APPLIED' | 'REVERSED' | 'SILENT_FAILED';
export declare class HcmTransaction {
    id: string;
    externalRef: string;
    employeeId: string;
    locationId: string;
    leaveType: string;
    transactionType: HcmTransactionType;
    days: number;
    startDate: string | null;
    endDate: string | null;
    status: HcmTransactionStatus;
    reversedBy: string | null;
    createdAt: string;
}
