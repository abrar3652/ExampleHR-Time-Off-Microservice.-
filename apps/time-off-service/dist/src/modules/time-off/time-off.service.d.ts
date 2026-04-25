import { DataSource } from 'typeorm';
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
    private readonly dataSource;
    private readonly balanceService;
    private readonly balanceRepository;
    constructor(dataSource: DataSource, balanceService: BalanceService, balanceRepository: BalanceRepository);
    createRequest(dto: CreateTimeOffRequestDto, employeeId: string, idempotencyKey: string): Promise<{
        requestId: string;
        state: RequestState.SUBMITTED;
        message: string;
        estimatedResolutionSeconds: number;
    }>;
    getRequestById(requestId: string): Promise<{
        requestId: string;
        employeeId: string;
        locationId: string;
        leaveType: LeaveType;
        startDate: string;
        endDate: string;
        daysRequested: number;
        state: RequestState;
        hcmExternalRef: string | null;
        rejectionReason: string | null;
        createdAt: string;
        updatedAt: string;
    }>;
    cancelRequest(requestId: string, employeeId: string): Promise<{
        requestId: string;
        state: RequestState;
        message: string;
    }>;
    private validateDto;
    private computeBusinessDays;
}
