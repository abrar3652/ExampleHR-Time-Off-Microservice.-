import { DataSource } from 'typeorm';
import { ChaosService } from '../services/chaos.service';
import { HcmCallLogService } from '../services/hcm-call-log.service';
import { HcmClockService } from '../services/hcm-clock.service';
interface ReverseBody {
    externalRef: string;
    hcmTransactionId: string;
    employeeId: string;
    reason: string;
}
export declare class HcmReverseController {
    private readonly dataSource;
    private readonly chaos;
    private readonly clock;
    private readonly callLog;
    constructor(dataSource: DataSource, chaos: ChaosService, clock: HcmClockService, callLog: HcmCallLogService);
    reverse(body: ReverseBody, res: any): Promise<void>;
}
export {};
