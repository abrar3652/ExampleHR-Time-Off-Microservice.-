import { Body, Controller, Post, Res } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import { HcmBalance } from '../entities/hcm-balance.entity';
import { HcmTransaction } from '../entities/hcm-transaction.entity';
import { ChaosRule, ChaosService } from '../services/chaos.service';
import { HcmCallLogService } from '../services/hcm-call-log.service';
import { HcmClockService } from '../services/hcm-clock.service';

interface DeductBody {
  externalRef: string;
  employeeId: string;
  locationId: string;
  leaveType: string;
  days: number;
  startDate: string;
  endDate: string;
}

@Controller('/api/hcm/timeoff')
export class HcmDeductController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly chaos: ChaosService,
    private readonly clock: HcmClockService,
    private readonly callLog: HcmCallLogService,
  ) {}

  @Post('/deduct')
  async deduct(@Body() body: DeductBody, @Res() res: any): Promise<void> {
    const started = Date.now();
    const endpoint = 'deduct';
    let chaosRule: ChaosRule | null = null;

    try {
      chaosRule = await this.chaos.shouldApplyChaos(endpoint);
      await this.chaos.applyBaseLatency();
      await this.chaos.applyDelay(chaosRule);

      if (chaosRule?.behavior === 'timeout') {
        await this.chaos.forceTimeoutClose(10000);
        await this.callLog.append({
          endpoint,
          method: 'POST',
          requestBody: body,
          responseStatus: 0,
          responseBody: { error: 'TIMEOUT' },
          chaosApplied: chaosRule.behavior,
          durationMs: Date.now() - started,
        });
        res.destroy();
        return;
      }

      const txRepo = this.dataSource.getRepository(HcmTransaction);
      const existing = await txRepo.findOne({ where: { externalRef: body.externalRef } });

      // D1: externalRef idempotency check.
      if (existing) {
        const responseBody = {
          error: 'DUPLICATE_EXTERNAL_REF',
          externalRef: body.externalRef,
          message: 'This externalRef has already been processed',
          existingTransaction: existing.id,
        };
        await this.callLog.append({
          endpoint,
          method: 'POST',
          requestBody: body,
          responseStatus: 409,
          responseBody,
          chaosApplied: chaosRule?.behavior ?? null,
          durationMs: Date.now() - started,
        });
        res.status(409).json(responseBody);
        return;
      }

      const forced = await this.chaos.injectBehavior(chaosRule, {
        endpoint,
        externalRef: body.externalRef,
      });
      if (forced && forced.status !== 409) {
        await this.callLog.append({
          endpoint,
          method: 'POST',
          requestBody: body,
          responseStatus: forced.status,
          responseBody: forced.body,
          chaosApplied: chaosRule?.behavior ?? null,
          durationMs: Date.now() - started,
        });
        res.status(forced.status).json(forced.body);
        return;
      }

      const balanceRepo = this.dataSource.getRepository(HcmBalance);
      const balance = await balanceRepo.findOne({
        where: {
          employeeId: body.employeeId,
          locationId: body.locationId,
          leaveType: body.leaveType,
        },
      });

      // D4: dimensions always validated.
      if (!balance) {
        const responseBody = {
          error: 'INVALID_DIMENSIONS',
          message: `No balance policy found for employee ${body.employeeId} at location ${body.locationId} for leave type ${body.leaveType}`,
        };
        await this.callLog.append({
          endpoint,
          method: 'POST',
          requestBody: body,
          responseStatus: 400,
          responseBody,
          chaosApplied: chaosRule?.behavior ?? null,
          durationMs: Date.now() - started,
        });
        res.status(400).json(responseBody);
        return;
      }

      const skipBalanceValidation = chaosRule?.behavior === 'invalid_validation';
      const available = balance.totalDays - balance.usedDays;

      // D2: validate available balance unless invalid_validation chaos is active.
      if (!skipBalanceValidation && body.days > available) {
        const responseBody = {
          error: 'INSUFFICIENT_BALANCE',
          available,
          requested: body.days,
          message: 'Employee does not have sufficient balance',
        };
        await this.callLog.append({
          endpoint,
          method: 'POST',
          requestBody: body,
          responseStatus: 422,
          responseBody,
          chaosApplied: chaosRule?.behavior ?? null,
          durationMs: Date.now() - started,
        });
        res.status(422).json(responseBody);
        return;
      }

      const hcmTransactionId = randomUUID();
      const now = await this.clock.nowIso();
      const projectedUsed = balance.usedDays + body.days;

      // D3: apply transaction atomically, except silent_success mode.
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(HcmTransaction).insert({
          id: hcmTransactionId,
          externalRef: body.externalRef,
          employeeId: body.employeeId,
          locationId: body.locationId,
          leaveType: body.leaveType,
          transactionType: 'DEDUCT',
          days: body.days,
          startDate: body.startDate,
          endDate: body.endDate,
          status: chaosRule?.behavior === 'silent_success' ? 'SILENT_FAILED' : 'APPLIED',
          reversedBy: null,
          createdAt: now,
        });

        if (chaosRule?.behavior !== 'silent_success') {
          await manager.getRepository(HcmBalance).update(
            { id: balance.id },
            {
              usedDays: projectedUsed,
              lastUpdatedAt: now,
            },
          );
        }
      });

      const responseBody = {
        externalRef: body.externalRef,
        hcmTransactionId,
        newUsedDays: projectedUsed,
        newTotalDays: balance.totalDays,
        lastUpdatedAt: now,
        message: 'Deduction applied successfully',
      };
      await this.callLog.append({
        endpoint,
        method: 'POST',
        requestBody: body,
        responseStatus: 200,
        responseBody,
        chaosApplied: chaosRule?.behavior ?? null,
        durationMs: Date.now() - started,
      });
      res.status(200).json(responseBody);
    } catch {
      const responseBody = { error: 'INTERNAL_SERVER_ERROR', message: 'Unexpected mock HCM error' };
      await this.callLog.append({
        endpoint,
        method: 'POST',
        requestBody: body,
        responseStatus: 500,
        responseBody,
        chaosApplied: chaosRule?.behavior ?? null,
        durationMs: Date.now() - started,
      });
      res.status(500).json(responseBody);
    }
  }
}
