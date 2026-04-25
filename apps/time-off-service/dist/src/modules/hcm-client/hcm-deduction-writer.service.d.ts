import { HcmClient } from './hcm-client.service';
import type { DeductPayload, HcmDeductResponse, HcmResult, HcmReverseResponse, ReversePayload } from './types';
export declare class HcmDeductionWriter {
    private readonly hcm;
    constructor(hcm: HcmClient);
    deduct(payload: DeductPayload): Promise<HcmResult<HcmDeductResponse>>;
    reverse(payload: ReversePayload): Promise<HcmResult<HcmReverseResponse>>;
}
