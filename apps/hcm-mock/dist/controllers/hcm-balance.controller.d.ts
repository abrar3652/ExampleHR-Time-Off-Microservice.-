import { DataSource } from 'typeorm';
import { ChaosService } from '../services/chaos.service';
import { HcmCallLogService } from '../services/hcm-call-log.service';
export declare class HcmBalanceController {
    private readonly dataSource;
    private readonly chaos;
    private readonly callLog;
    constructor(dataSource: DataSource, chaos: ChaosService, callLog: HcmCallLogService);
    getBalance(employeeId: string, locationId: string, leaveType: string, res: any): Promise<void>;
}
