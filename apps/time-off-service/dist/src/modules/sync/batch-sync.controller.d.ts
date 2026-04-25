import { DataSource } from 'typeorm';
import { BatchSyncService, BatchRecord } from './batch-sync.service';
export declare class BatchSyncController {
    private readonly service;
    private readonly dataSource;
    constructor(service: BatchSyncService, dataSource: DataSource);
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
    reconciliationStatus(): Promise<{
        runId: string | null;
        ranAt: string | null;
        totalChecked: number;
        driftsDetected: number;
        autoCorrected: number;
        pendingReview: number;
    }>;
}
