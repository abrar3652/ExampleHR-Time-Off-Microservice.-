import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Get } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { BatchSyncService, BatchRecord } from './batch-sync.service';
import { ReconciliationLog } from './entities/reconciliation-log.entity';

@Controller('/sync')
export class BatchSyncController {
  constructor(
    private readonly service: BatchSyncService,
    private readonly dataSource: DataSource,
  ) {}

  @Post('/batch/balances')
  @HttpCode(200)
  async applyBatch(
    @Body()
    body: { batchId: string; generatedAt: string; records: BatchRecord[] },
  ): Promise<{ batchId: string; processed: number; skipped: number; failed: number; message: string }> {
    const result = await this.service.applyBatch(body.records ?? [], body.batchId, body.generatedAt);
    return {
      batchId: body.batchId,
      processed: result.processed,
      skipped: result.skipped,
      failed: result.failed,
      message: `Batch applied. ${result.skipped} records skipped (older than local data).`,
    };
  }

  @Get('/reconciliation/status')
  async reconciliationStatus(): Promise<{
    runId: string | null;
    ranAt: string | null;
    totalChecked: number;
    driftsDetected: number;
    autoCorrected: number;
    pendingReview: number;
  }> {
    const latest = await this.dataSource
      .getRepository(ReconciliationLog)
      .createQueryBuilder('r')
      .orderBy('r.created_at', 'DESC')
      .getOne();
    if (!latest) {
      return {
        runId: null,
        ranAt: null,
        totalChecked: 0,
        driftsDetected: 0,
        autoCorrected: 0,
        pendingReview: 0,
      };
    }

    const rows = await this.dataSource.getRepository(ReconciliationLog).findBy({ runId: latest.runId });
    return {
      runId: latest.runId,
      ranAt: latest.createdAt,
      totalChecked: rows.length,
      driftsDetected: rows.length,
      autoCorrected: rows.filter((r) => r.resolution === 'AUTO_CORRECTED').length,
      pendingReview: rows.filter((r) => r.resolution !== 'AUTO_CORRECTED').length,
    };
  }
}

