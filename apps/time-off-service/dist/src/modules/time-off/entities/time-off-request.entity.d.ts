import { LeaveType, OutboxEventType, RequestState } from '../../../domain/enums';
export declare class TimeOffRequest {
    id: string;
    idempotencyKey: string;
    employeeId: string;
    locationId: string;
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    daysRequested: number;
    state: RequestState;
    lastOutboxEvent: OutboxEventType | null;
    hcmExternalRef: string | null;
    hcmTransactionId: string | null;
    hcmResponseCode: number | null;
    hcmResponseBody: string | null;
    rejectionReason: string | null;
    failureReason: string | null;
    retryCount: number;
    createdBy: string;
    approvedBy: string | null;
    createdAt: string;
    updatedAt: string;
}
