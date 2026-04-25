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
}
