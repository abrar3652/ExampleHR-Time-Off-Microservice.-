import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

import { HcmBalance } from '../entities/hcm-balance.entity';
import { HcmCallLogService } from '../services/hcm-call-log.service';
import { HcmClockService } from '../services/hcm-clock.service';

@Injectable()
export class HcmDriftJob {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: HcmClockService,
    private readonly callLog: HcmCallLogService,
  ) {}

  @Interval(300000)
  async run(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') return;
    const started = Date.now();
    const repo = this.dataSource.getRepository(HcmBalance);
    const balances = await repo.find();
    if (balances.length === 0) return;

    const index = Math.floor(Math.random() * balances.length);
    const selected = balances[index];
    if (!selected) return;
    const now = await this.clock.nowIso();
    const isAnniversary = Math.random() < 0.5;

    if (isAnniversary) {
      const delta = this.roundHalf(this.randomFloat(1, 5));
      await repo.update(
        { id: selected.id },
        {
          totalDays: selected.totalDays + delta,
          lastUpdatedAt: now,
        },
      );
      await this.callLog.append({
        endpoint: 'DRIFT_JOB',
        method: 'JOB',
        requestBody: { type: 'work_anniversary', balanceId: selected.id, delta },
        responseStatus: 200,
        responseBody: { ok: true },
        chaosApplied: null,
        durationMs: Date.now() - started,
      });
      return;
    }

    const requested = this.roundHalf(this.randomFloat(0.5, 2));
    const available = Math.max(0, selected.totalDays - selected.usedDays);
    const applied = Math.min(available, requested);
    await repo.update(
      { id: selected.id },
      {
        usedDays: selected.usedDays + applied,
        lastUpdatedAt: now,
      },
    );
    await this.callLog.append({
      endpoint: 'DRIFT_JOB',
      method: 'JOB',
      requestBody: { type: 'random_deduction', balanceId: selected.id, requested, applied },
      responseStatus: 200,
      responseBody: { ok: true },
      chaosApplied: null,
      durationMs: Date.now() - started,
    });
  }

  private randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private roundHalf(value: number): number {
    return Math.round(value * 2) / 2;
  }
}
