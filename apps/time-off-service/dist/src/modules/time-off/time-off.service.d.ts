import { LeaveType, RequestState } from '../../domain/enums';
import { BalanceRepository } from '../balance/balance.repository';
import { BalanceService } from '../balance/balance.service';
export interface CreateTimeOffRequestDto {
    locationId: string;
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    daysRequested: number;
    note?: string;
}
export declare class TimeOffService {
    private readonly balanceService;
    private readonly balanceRepository;
    constructor(balanceService: BalanceService, balanceRepository: BalanceRepository);
    createRequest(dto: CreateTimeOffRequestDto, employeeId: string, idempotencyKey: string): Promise<{
        requestId: string;
        state: RequestState.SUBMITTED;
        message: string;
        estimatedResolutionSeconds: number;
    }>;
    private validateDto;
    private computeBusinessDays;
}
