import { DataSource } from 'typeorm';
import { HcmClient } from '../hcm-client/hcm-client.service';
import { BatchSyncService } from './batch-sync.service';
export declare class BatchPullWorker {
    private readonly dataSource;
    private readonly hcmClient;
    private readonly batchSyncService;
    private readonly logger;
    constructor(dataSource: DataSource, hcmClient: HcmClient, batchSyncService: BatchSyncService);
    run(): Promise<void>;
}
