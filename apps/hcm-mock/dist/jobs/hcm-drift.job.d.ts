import { DataSource } from 'typeorm';
import { HcmCallLogService } from '../services/hcm-call-log.service';
import { HcmClockService } from '../services/hcm-clock.service';
export declare class HcmDriftJob {
    private readonly dataSource;
    private readonly clock;
    private readonly callLog;
    constructor(dataSource: DataSource, clock: HcmClockService, callLog: HcmCallLogService);
    run(): Promise<void>;
    private randomFloat;
    private roundHalf;
}
