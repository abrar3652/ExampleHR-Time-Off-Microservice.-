import { Controller, Get, Param } from '@nestjs/common';

import { LeaveType } from '../../domain/enums';
import { BalanceService } from './balance.service';

@Controller()
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get('/balances/:employeeId/:locationId/:leaveType')
  async getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Param('leaveType') leaveType: LeaveType,
  ): Promise<{
    employeeId: string;
    locationId: string;
    leaveType: LeaveType;
    totalDays: number;
    usedDays: number;
    pendingDays: number;
    availableDays: number;
    syncedAt: string;
    hcmLastUpdatedAt: string;
  }> {
    const b = await this.balanceService.getOrFetchBalance(employeeId, locationId, leaveType);
    return {
      employeeId: b.employeeId,
      locationId: b.locationId,
      leaveType: b.leaveType,
      totalDays: b.totalDays,
      usedDays: b.usedDays,
      pendingDays: b.pendingDays,
      availableDays: b.totalDays - b.usedDays - b.pendingDays,
      syncedAt: b.syncedAt,
      hcmLastUpdatedAt: b.hcmLastUpdatedAt,
    };
  }
}

