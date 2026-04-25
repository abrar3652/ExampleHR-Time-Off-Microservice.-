import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { HcmBalance } from '../entities/hcm-balance.entity';
import { HcmCallLog } from '../entities/hcm-call-log.entity';
import { HcmTransaction } from '../entities/hcm-transaction.entity';
import { ChaosBehavior, ChaosService } from '../services/chaos.service';
import { HcmClockService } from '../services/hcm-clock.service';

interface BehaviorBody {
  endpoint: string;
  behavior: ChaosBehavior;
  count: number;
  delayMs?: number;
}

interface BalanceBody {
  employeeId: string;
  locationId: string;
  leaveType: string;
  totalDays: number;
  usedDays: number;
  hcmLastUpdatedAt: string;
}

interface DriftBody {
  employeeId: string;
  locationId: string;
  leaveType: string;
  newTotalDays: number;
  reason: string;
}

interface AdvanceClockBody {
  milliseconds: number;
}

@Controller('/__control')
export class ControlController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly chaos: ChaosService,
    private readonly clock: HcmClockService,
  ) {}

  @Post('/behavior')
  async setBehavior(@Body() body: BehaviorBody): Promise<{ ok: true; config: unknown }> {
    await this.chaos.setRule(body.endpoint, {
      behavior: body.behavior,
      remaining_count: body.count,
      delay_ms: body.delayMs ?? 0,
    });
    return { ok: true, config: await this.chaos.loadConfig() };
  }

  @Post('/balance')
  async setBalance(@Body() body: BalanceBody): Promise<{ ok: true }> {
    const repo = this.dataSource.getRepository(HcmBalance);
    const existing = await repo.findOne({
      where: {
        employeeId: body.employeeId,
        locationId: body.locationId,
        leaveType: body.leaveType,
      },
    });
    const createdAt = existing?.createdAt ?? (await this.clock.nowIso());
    const row = {
      employeeId: body.employeeId,
      locationId: body.locationId,
      leaveType: body.leaveType,
      totalDays: body.totalDays,
      usedDays: body.usedDays,
      lastUpdatedAt: body.hcmLastUpdatedAt,
      createdAt,
    };

    if (existing?.id) {
      await repo.upsert({ id: existing.id, ...row }, ['employeeId', 'locationId', 'leaveType']);
    } else {
      await repo.upsert(row, ['employeeId', 'locationId', 'leaveType']);
    }
    return { ok: true };
  }

  @Post('/drift')
  async drift(@Body() body: DriftBody): Promise<{ ok: true; lastUpdatedAt: string }> {
    const repo = this.dataSource.getRepository(HcmBalance);
    const existing = await repo.findOne({
      where: {
        employeeId: body.employeeId,
        locationId: body.locationId,
        leaveType: body.leaveType,
      },
    });
    if (!existing) {
      throw new BadRequestException({
        error: 'INVALID_DIMENSIONS',
        message: `No balance policy found for employee ${body.employeeId} at location ${body.locationId} for leave type ${body.leaveType}`,
      });
    }

    const now = await this.clock.nowIso();
    const usedDays = body.reason === 'year_reset' ? 0 : existing.usedDays;
    await repo.update(
      { id: existing.id },
      {
        totalDays: body.newTotalDays,
        usedDays,
        lastUpdatedAt: now,
      },
    );
    return { ok: true, lastUpdatedAt: now };
  }

  @Post('/advance-clock')
  async advanceClock(@Body() body: AdvanceClockBody): Promise<{ ok: true; offsetMs: number }> {
    const offsetMs = await this.clock.advance(body.milliseconds);
    return { ok: true, offsetMs };
  }

  @Get('/call-log')
  async getCallLog(): Promise<
    Array<{
      endpoint: string;
      method: string;
      responseStatus: number;
      chaosApplied: string | null;
      calledAt: string;
    }>
  > {
    const rows = await this.dataSource.getRepository(HcmCallLog).find({ order: { calledAt: 'ASC' } });
    return rows.map((row) => ({
      endpoint: row.endpoint,
      method: row.method,
      responseStatus: row.responseStatus,
      chaosApplied: row.chaosApplied,
      calledAt: row.calledAt,
    }));
  }

  @Post('/reset')
  async reset(): Promise<{ ok: true }> {
    await this.dataSource.getRepository(HcmCallLog).delete({});
    await this.dataSource.getRepository(HcmTransaction).delete({});
    await this.dataSource.getRepository(HcmBalance).delete({});
    await this.chaos.resetAll();
    await this.clock.reset();
    return { ok: true };
  }
}
