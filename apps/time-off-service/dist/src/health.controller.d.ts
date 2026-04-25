import { DataSource } from 'typeorm';
import { HcmClient } from './modules/hcm-client/hcm-client.service';
export declare class HealthController {
    private readonly dataSource;
    private readonly hcmClient;
    constructor(dataSource: DataSource, hcmClient: HcmClient);
    getHealth(): Promise<{
        status: 'ok';
        hcmReachable: boolean;
        outboxPendingCount: number;
        lastBatchSyncAt: string | null;
        lastReconciliationAt: string | null;
    }>;
}
