import { DataSource } from 'typeorm';
import { HcmClient } from '../hcm-client/hcm-client.service';
export declare class ReconciliationWorker {
    private readonly dataSource;
    private readonly hcmClient;
    private readonly logger;
    constructor(dataSource: DataSource, hcmClient: HcmClient);
    run(): Promise<void>;
    runReconciliation(force?: boolean): Promise<void>;
}
