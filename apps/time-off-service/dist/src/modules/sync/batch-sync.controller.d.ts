import { BatchSyncService, BatchRecord } from './batch-sync.service';
export declare class BatchSyncController {
    private readonly service;
    constructor(service: BatchSyncService);
    applyBatch(body: {
        batchId: string;
        generatedAt: string;
        records: BatchRecord[];
    }): Promise<{
        batchId: string;
        processed: number;
        skipped: number;
        failed: number;
        message: string;
    }>;
}
