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
    const claimed = await this.outboxRepo.claimPending(5);
    for (const record of claimed) {
      try {
        await this.processor.process(record);
        this.logger.log({
          outboxId: record.id,
          requestId: record.requestId,
          eventType: record.eventType,
          attempt: record.attempts + 1,
          result: 'OK',
        });
      } catch (err: any) {
        this.logger.error({
          outboxId: record.id,
          requestId: record.requestId,
          eventType: record.eventType,
          attempt: record.attempts + 1,
          result: 'ERROR',
          err: err?.message ?? String(err),
        });
      }
    }
  }
}

