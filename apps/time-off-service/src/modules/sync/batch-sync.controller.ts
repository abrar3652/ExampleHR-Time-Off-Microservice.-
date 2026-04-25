import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { BatchSyncService, BatchRecord } from './batch-sync.service';

@Controller('/sync')
export class BatchSyncController {
  constructor(private readonly service: BatchSyncService) {}

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
}

