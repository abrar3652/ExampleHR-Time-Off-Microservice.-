import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

import { HcmClient } from '../hcm-client/hcm-client.service';
import { BatchSyncService, BatchRecord } from './batch-sync.service';
import { SyncCheckpoint } from './entities/sync-checkpoint.entity';

type PullResponse = {
  batchId: string;
  generatedAt: string;
  records: BatchRecord[];
  hasMore?: boolean;
  nextCursor?: string | null;
};

@Injectable()
export class BatchPullWorker {
  private readonly logger = new Logger(BatchPullWorker.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly hcmClient: HcmClient,
    private readonly batchSyncService: BatchSyncService,
  ) {}

  @Cron('0 * * * *')
  async run(): Promise<void> {
    if (process.env.DISABLE_BACKGROUND_WORKERS === '1') return;
    const checkpoint = await this.dataSource.getRepository(SyncCheckpoint).findOneBy({ id: 'singleton' });
    const since = checkpoint?.lastBatchAt ?? undefined;
    let cursor: string | null = null;

    while (true) {
      const params: Record<string, string> = { limit: '500' };
      if (cursor) params.cursor = cursor;
      else if (since) params.since = since;

      const result = await this.hcmClient.callHcm<PullResponse>(
        () => this.hcmClient.axios.get('/api/hcm/batch/balances', { params }),
        'batch_pull',
      );

      if (!result.success) {
        this.logger.warn(JSON.stringify({ event: 'batch_pull_failed', reason: result.reason }));
        return;
      }

      const page = result.data;
      if ((page.records?.length ?? 0) === 0 && !cursor) return;

      const applied = await this.batchSyncService.applyBatch(page.records ?? [], page.batchId, page.generatedAt);
      this.logger.log(
        JSON.stringify({
          event: 'batch_pull_page_processed',
          batchId: page.batchId,
          processed: applied.processed,
          skipped: applied.skipped,
        }),
      );
      if (!page.hasMore) break;
      cursor = page.nextCursor ?? null;
    }
  }
}

