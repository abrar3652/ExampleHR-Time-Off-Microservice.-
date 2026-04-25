import { Controller, Get } from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { HcmClient } from './modules/hcm-client/hcm-client.service';
import { ReconciliationLog } from './modules/sync/entities/reconciliation-log.entity';
import { SyncCheckpoint } from './modules/sync/entities/sync-checkpoint.entity';
import { Outbox } from './modules/time-off/entities/outbox.entity';

@Controller('/health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly hcmClient: HcmClient,
  ) {}

  @Get()
  async getHealth(): Promise<{
    status: 'ok';
    hcmReachable: boolean;
    outboxPendingCount: number;
    lastBatchSyncAt: string | null;
    lastReconciliationAt: string | null;
  }> {
    const hcmPing = await this.hcmClient.callHcm(
      () => this.hcmClient.axios.get('/api/hcm/balance/emp-001/loc-nyc/ANNUAL'),
      'health:ping',
    );
    const outboxPendingCount = await this.dataSource.getRepository(Outbox).count({
      where: { status: In(['PENDING', 'PROCESSING']) },
    });
    const checkpoint = await this.dataSource.getRepository(SyncCheckpoint).findOneBy({ id: 'singleton' });
    const latestReconciliation = await this.dataSource
      .getRepository(ReconciliationLog)
      .createQueryBuilder('r')
      .select('MAX(r.created_at)', 'lastReconciliationAt')
      .getRawOne<{ lastReconciliationAt: string | null }>();

    return {
      status: 'ok',
      hcmReachable: hcmPing.success,
      outboxPendingCount,
      lastBatchSyncAt: checkpoint?.lastBatchAt ?? null,
      lastReconciliationAt: latestReconciliation?.lastReconciliationAt ?? null,
    };
  }
}
