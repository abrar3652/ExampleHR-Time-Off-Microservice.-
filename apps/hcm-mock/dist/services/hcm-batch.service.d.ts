import { DataSource } from 'typeorm';
import { HcmClockService } from './hcm-clock.service';
export interface HcmBatchRecord {
    employeeId: string;
    locationId: string;
    leaveType: string;
    totalDays: number;
    usedDays: number;
    hcmLastUpdatedAt: string;
}
export declare class HcmBatchService {
    private readonly dataSource;
    private readonly clock;
    constructor(dataSource: DataSource, clock: HcmClockService);
    cleanupExpiredSnapshots(): Promise<void>;
    createSnapshot(since?: string): Promise<{
        batchId: string;
        generatedAt: string;
        totalCount: number;
    }>;
    getPage(batchId: string, lastIndex: number, limit: number): Promise<{
        generatedAt: string;
        records: HcmBatchRecord[];
        totalCount: number;
        nextLastIndex: number | null;
    }>;
    encodeCursor(input: {
        batchId: string;
        lastIndex: number;
    }): string;
    decodeCursor(cursor: string): {
        batchId: string;
        lastIndex: number;
    } | null;
}
