import { DataSource } from 'typeorm';
import { ChaosService } from '../services/chaos.service';
import { HcmCallLogService } from '../services/hcm-call-log.service';
import { HcmClockService } from '../services/hcm-clock.service';
interface DeductBody {
    externalRef: string;
    employeeId: string;
    locationId: string;
    leaveType: string;
    days: number;
    startDate: string;
    endDate: string;
}
export declare class HcmDeductController {
    private readonly dataSource;
    private readonly chaos;
    private readonly clock;
    private readonly callLog;
    constructor(dataSource: DataSource, chaos: ChaosService, clock: HcmClockService, callLog: HcmCallLogService);
    deduct(body: DeductBody, res: any): Promise<void>;
}
export {};
