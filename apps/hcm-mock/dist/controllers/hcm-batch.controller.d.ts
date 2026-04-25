import { HcmBatchService, type HcmBatchRecord } from '../services/hcm-batch.service';
export declare class HcmBatchController {
    private readonly batchService;
    constructor(batchService: HcmBatchService);
    getBalances(since?: string, cursor?: string, limitRaw?: string): Promise<{
        batchId: string;
        generatedAt: string;
        records: HcmBatchRecord[];
        hasMore: boolean;
        nextCursor: string | null;
        totalCount: number;
    }>;
}
