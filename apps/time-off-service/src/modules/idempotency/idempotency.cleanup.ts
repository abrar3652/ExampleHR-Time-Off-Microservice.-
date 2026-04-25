import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { IdempotencyRepository } from './idempotency.repository';

@Injectable()
export class IdempotencyCleanupJob {
  constructor(private readonly repo: IdempotencyRepository) {}

  @Cron('0 0 * * *')
  async cleanup(): Promise<void> {
    await this.repo.deleteExpired(new Date().toISOString());
  }
}

