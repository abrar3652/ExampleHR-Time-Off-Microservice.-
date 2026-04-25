import { ChaosService } from '../services/chaos.service';
import { HcmBatchService } from '../services/hcm-batch.service';
import { HcmCallLogService } from '../services/hcm-call-log.service';
export declare class HcmPushJob {
    private readonly chaos;
    private readonly batchService;
    private readonly callLog;
    private lastRunAt;
    constructor(chaos: ChaosService, batchService: HcmBatchService, callLog: HcmCallLogService);
    run(): Promise<void>;
}
