import { HcmBatchService, type HcmBatchRecord } from '../services/hcm-batch.service';
import { ChaosService } from '../services/chaos.service';
export declare class HcmBatchController {
    private readonly batchService;
    private readonly chaos;
    constructor(batchService: HcmBatchService, chaos: ChaosService);
    getBalances(since?: string, cursor?: string, limitRaw?: string): Promise<{
        batchId: string;
        generatedAt: string;
        records: HcmBatchRecord[];
        hasMore: boolean;
        nextCursor: string | null;
        totalCount: number;
    }>;
}
