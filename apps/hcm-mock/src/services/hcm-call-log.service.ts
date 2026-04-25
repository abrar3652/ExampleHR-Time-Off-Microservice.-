import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { HcmCallLog } from '../entities/hcm-call-log.entity';
import { HcmClockService } from './hcm-clock.service';

@Injectable()
export class HcmCallLogService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: HcmClockService,
  ) {}

  async append(input: {
    endpoint: string;
    method: string;
    requestBody?: unknown;
    responseStatus: number;
    responseBody?: unknown;
    chaosApplied?: string | null;
    durationMs: number;
  }): Promise<void> {
    await this.dataSource.getRepository(HcmCallLog).insert({
      endpoint: input.endpoint,
      method: input.method,
      requestBody: input.requestBody == null ? null : JSON.stringify(input.requestBody),
      responseStatus: input.responseStatus,
      responseBody: input.responseBody == null ? null : JSON.stringify(input.responseBody),
      chaosApplied: input.chaosApplied ?? null,
      durationMs: input.durationMs,
      calledAt: await this.clock.nowIso(),
    });
  }
}
