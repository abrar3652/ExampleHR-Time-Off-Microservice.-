import { Module } from '@nestjs/common';

import { HcmClientModule } from '../hcm-client/hcm-client.module';
import { OutboxProcessor } from './outbox.processor';
import { OutboxRepository } from './outbox.repository';
import { OutboxWorker } from './outbox.worker';

@Module({
  imports: [HcmClientModule],
  providers: [OutboxRepository, OutboxProcessor, OutboxWorker],
  exports: [OutboxRepository, OutboxProcessor, OutboxWorker],
})
export class OutboxModule {}

