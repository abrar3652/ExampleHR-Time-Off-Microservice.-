import { TimeOffService, type CreateTimeOffRequestDto } from './time-off.service';
export declare class TimeOffController {
    private readonly timeOffService;
    constructor(timeOffService: TimeOffService);
    createRequest(dto: CreateTimeOffRequestDto, employeeId: string, idempotencyKey: string): Promise<{
        requestId: string;
        state: import("../../domain/enums").RequestState.SUBMITTED;
        message: string;
        estimatedResolutionSeconds: number;
    }>;
    getRequestById(requestId: string): Promise<{
        requestId: string;
        employeeId: string;
        locationId: string;
        leaveType: import("../../domain/enums").LeaveType;
        startDate: string;
        endDate: string;
        daysRequested: number;
        state: import("../../domain/enums").RequestState;
        hcmExternalRef: string | null;
        rejectionReason: string | null;
        createdAt: string;
        updatedAt: string;
    }>;
    cancel(requestId: string, employeeId: string): Promise<{
        requestId: string;
        state: import("../../domain/enums").RequestState;
        message: string;
    }>;
}
