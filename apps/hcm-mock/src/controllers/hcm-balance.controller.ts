import { Controller, Get, Param, Res } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { HcmBalance } from '../entities/hcm-balance.entity';
import { ChaosRule, ChaosService } from '../services/chaos.service';
import { HcmCallLogService } from '../services/hcm-call-log.service';

@Controller('/api/hcm/balance')
export class HcmBalanceController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly chaos: ChaosService,
    private readonly callLog: HcmCallLogService,
  ) {}

  @Get('/:employeeId/:locationId/:leaveType')
  async getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Param('leaveType') leaveType: string,
    @Res() res: any,
  ): Promise<void> {
    const started = Date.now();
    const endpoint = 'balance_get';
    const requestBody = { employeeId, locationId, leaveType };
    let chaosRule: ChaosRule | null = null;

    try {
      chaosRule = await this.chaos.shouldApplyChaos(endpoint);
      await this.chaos.applyBaseLatency();
      await this.chaos.applyDelay(chaosRule);

      if (chaosRule?.behavior === 'timeout') {
        await this.chaos.forceTimeoutClose(10000);
        await this.callLog.append({
          endpoint,
          method: 'GET',
          requestBody,
          responseStatus: 0,
          responseBody: { error: 'TIMEOUT' },
          chaosApplied: chaosRule.behavior,
          durationMs: Date.now() - started,
        });
        res.destroy();
        return;
      }

      const chaosResponse = await this.chaos.injectBehavior(chaosRule, { endpoint });
      if (chaosResponse) {
        await this.callLog.append({
          endpoint,
          method: 'GET',
          requestBody,
          responseStatus: chaosResponse.status,
          responseBody: chaosResponse.body,
          chaosApplied: chaosRule?.behavior ?? null,
          durationMs: Date.now() - started,
        });
        res.status(chaosResponse.status).json(chaosResponse.body);
        return;
      }

      const balance = await this.dataSource.getRepository(HcmBalance).findOne({
        where: { employeeId, locationId, leaveType },
      });

      if (!balance) {
        const body = {
          error: 'EMPLOYEE_BALANCE_NOT_FOUND',
          message: 'No balance record found for the given dimensions',
        };
        await this.callLog.append({
          endpoint,
          method: 'GET',
          requestBody,
          responseStatus: 404,
          responseBody: body,
          chaosApplied: chaosRule?.behavior ?? null,
          durationMs: Date.now() - started,
        });
        res.status(404).json(body);
        return;
      }

      const body = {
        employeeId: balance.employeeId,
        locationId: balance.locationId,
        leaveType: balance.leaveType,
        totalDays: balance.totalDays,
        usedDays: balance.usedDays,
        lastUpdatedAt: balance.lastUpdatedAt,
      };
      await this.callLog.append({
        endpoint,
        method: 'GET',
        requestBody,
        responseStatus: 200,
        responseBody: body,
        chaosApplied: chaosRule?.behavior ?? null,
        durationMs: Date.now() - started,
      });
      res.status(200).json(body);
    } catch (err) {
      const body = { error: 'INTERNAL_SERVER_ERROR', message: 'Unexpected mock HCM error' };
      await this.callLog.append({
        endpoint,
        method: 'GET',
        requestBody,
        responseStatus: 500,
        responseBody: body,
        chaosApplied: chaosRule?.behavior ?? null,
        durationMs: Date.now() - started,
      });
      res.status(500).json(body);
    }
  }
}
