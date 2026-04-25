import { DataSource } from 'typeorm';
export interface BatchRecord {
    employeeId: string;
    locationId: string;
    leaveType: string;
    totalDays: number;
    usedDays: number;
    hcmLastUpdatedAt: string;
}
export declare class BatchSyncService {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    private toHcmMillis;
    applyBatch(records: BatchRecord[], batchId: string, generatedAt: string): Promise<{
        processed: number;
        skipped: number;
        failed: number;
    }>;
    private applyOneRecord;
}
