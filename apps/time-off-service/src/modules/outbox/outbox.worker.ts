import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { OutboxProcessor } from './outbox.processor';
import { OutboxRepository } from './outbox.repository';

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);

  constructor(
    private readonly outboxRepo: OutboxRepository,
    private readonly processor: OutboxProcessor,
  ) {}

  @Interval(500)
  async poll(): Promise<void> {
    if (process.env.DISABLE_BACKGROUND_WORKERS === '1') return;
    await this.outboxRepo.resetStuckProcessing();
    const pendingCount = await this.outboxRepo.countPendingOrProcessing();
    const claimed = await this.outboxRepo.claimPending(5);
    let processedCount = 0;
    let failedCount = 0;
    for (const record of claimed) {
      try {
        await this.processor.process(record);
        processedCount += 1;
        this.logger.log(JSON.stringify({
          outboxId: record.id,
          requestId: record.requestId,
          eventType: record.eventType,
          attempt: record.attempts + 1,
          result: 'OK',
        }));
      } catch (err: any) {
        failedCount += 1;
        this.logger.error(JSON.stringify({
          outboxId: record.id,
          requestId: record.requestId,
          eventType: record.eventType,
          attempt: record.attempts + 1,
          result: 'ERROR',
          err: err?.message ?? String(err),
        }));
      }
    }
    this.logger.log(
      JSON.stringify({
        event: 'outbox_tick',
        pendingCount,
        processedCount,
        failedCount,
      }),
    );
  }
}

