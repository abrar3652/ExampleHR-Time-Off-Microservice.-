export type HcmFailureReason = 'TIMEOUT' | 'SERVER_ERROR' | 'CLIENT_ERROR' | 'NETWORK_ERROR';
export type HcmResult<T> = {
    success: true;
    data: T;
    statusCode: number;
} | {
    success: false;
    reason: HcmFailureReason;
    statusCode?: number;
    body?: unknown;
};
export interface HcmBalanceResponse {
    employeeId: string;
    locationId: string;
    leaveType: string;
    totalDays: number;
    usedDays: number;
    lastUpdatedAt: string;
}
export interface DeductPayload {
    externalRef: string;
    employeeId: string;
    locationId: string;
    leaveType: string;
    days: number;
    startDate?: string;
    endDate?: string;
}
export interface ReversePayload {
    externalRef: string;
    hcmTransactionId: string;
    employeeId: string;
    locationId: string;
    leaveType: string;
    days: number;
}
export interface HcmDeductResponse {
    hcmTransactionId: string;
    newTotalDays: number;
    newUsedDays: number;
    lastUpdatedAt: string;
}
export interface HcmReverseResponse {
    hcmTransactionId: string;
    newTotalDays: number;
    newUsedDays: number;
    lastUpdatedAt: string;
}
