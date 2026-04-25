import { HcmClient } from './hcm-client.service';
import type { HcmBalanceResponse, HcmResult } from './types';
export declare class HcmBalanceFetcher {
    private readonly hcm;
    constructor(hcm: HcmClient);
    getBalance(employeeId: string, locationId: string, leaveType: string): Promise<HcmResult<HcmBalanceResponse>>;
}
