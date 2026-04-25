import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { HcmClientModule } from '../hcm-client/hcm-client.module';
import { BatchSyncController } from './batch-sync.controller';
import { BatchPullWorker } from './batch-pull.worker';
import { BatchSyncService } from './batch-sync.service';
import { ReconciliationWorker } from './reconciliation.worker';
import { ReconciliationLog } from './entities/reconciliation-log.entity';
import { SyncCheckpoint } from './entities/sync-checkpoint.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SyncCheckpoint, ReconciliationLog]), HcmClientModule],
  controllers: [BatchSyncController],
  providers: [BatchSyncService, BatchPullWorker, ReconciliationWorker],
  exports: [BatchSyncService],
})
export class SyncModule {}

