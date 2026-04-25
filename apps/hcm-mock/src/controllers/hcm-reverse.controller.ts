import { Body, Controller, Post, Res } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import { HcmBalance } from '../entities/hcm-balance.entity';
import { HcmTransaction } from '../entities/hcm-transaction.entity';
import { ChaosRule, ChaosService } from '../services/chaos.service';
import { HcmCallLogService } from '../services/hcm-call-log.service';
import { HcmClockService } from '../services/hcm-clock.service';

interface ReverseBody {
  externalRef: string;
  hcmTransactionId: string;
  employeeId: string;
  reason: string;
}

@Controller('/api/hcm/timeoff')
export class HcmReverseController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly chaos: ChaosService,
    private readonly clock: HcmClockService,
    private readonly callLog: HcmCallLogService,
  ) {}

  @Post('/reverse')
  async reverse(@Body() body: ReverseBody, @Res() res: any): Promise<void> {
    const started = Date.now();
    const endpoint = 'reverse';
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

      const forced = await this.chaos.injectBehavior(chaosRule, {
        endpoint,
        externalRef: body.externalRef,
      });
      if (forced) {
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

      const txRepo = this.dataSource.getRepository(HcmTransaction);
      const original = await txRepo.findOne({ where: { id: body.hcmTransactionId } });

      // R1: original transaction must exist.
      if (!original) {
        const responseBody = {
          error: 'TRANSACTION_NOT_FOUND',
          hcmTransactionId: body.hcmTransactionId,
          message: 'No HCM transaction found with the given ID',
        };
        await this.callLog.append({
          endpoint,
          method: 'POST',
          requestBody: body,
          responseStatus: 404,
          responseBody,
          chaosApplied: chaosRule?.behavior ?? null,
          durationMs: Date.now() - started,
        });
        res.status(404).json(responseBody);
        return;
      }

      // R2: no double reversal.
      if (original.status === 'REVERSED') {
        const responseBody = {
          error: 'ALREADY_REVERSED',
          message: 'This transaction has already been reversed',
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

      const reversalTransactionId = randomUUID();
      const now = await this.clock.nowIso();
      let restoredDays = 0;
      let resultingUsedDays = 0;

      await this.dataSource.transaction(async (manager) => {
        const balanceRepo = manager.getRepository(HcmBalance);
        const currentBalance = await balanceRepo.findOne({
          where: {
            employeeId: original.employeeId,
            locationId: original.locationId,
            leaveType: original.leaveType,
          },
        });

        if (!currentBalance) {
          throw new Error('BALANCE_NOT_FOUND_FOR_TRANSACTION');
        }

        if (original.status === 'SILENT_FAILED') {
          // R3: reversal of silent_failed restores 0 days.
          restoredDays = 0;
          resultingUsedDays = currentBalance.usedDays;
        } else {
          // R4: apply reversal and clamp at 0.
          restoredDays = original.days;
          resultingUsedDays = Math.max(0, currentBalance.usedDays - original.days);
          await balanceRepo.update(
            { id: currentBalance.id },
            {
              usedDays: resultingUsedDays,
              lastUpdatedAt: now,
            },
          );
        }

        await manager.getRepository(HcmTransaction).update(
          { id: original.id },
          {
            status: 'REVERSED',
            reversedBy: reversalTransactionId,
          },
        );

        await manager.getRepository(HcmTransaction).insert({
          id: reversalTransactionId,
          externalRef: `${body.externalRef}:reverse:${reversalTransactionId}`,
          employeeId: original.employeeId,
          locationId: original.locationId,
          leaveType: original.leaveType,
          transactionType: 'REVERSE',
          days: restoredDays,
          startDate: null,
          endDate: null,
          status: 'APPLIED',
          reversedBy: null,
          createdAt: now,
        });
      });

      const responseBody = {
        externalRef: body.externalRef,
        reversalTransactionId,
        restoredDays,
        newUsedDays: resultingUsedDays,
        lastUpdatedAt: now,
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
