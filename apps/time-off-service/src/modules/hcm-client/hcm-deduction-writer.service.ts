import { Injectable } from '@nestjs/common';

import { HcmClient } from './hcm-client.service';
import type { DeductPayload, HcmDeductResponse, HcmResult, HcmReverseResponse, ReversePayload } from './types';

@Injectable()
export class HcmDeductionWriter {
  constructor(private readonly hcm: HcmClient) {}

  deduct(payload: DeductPayload): Promise<HcmResult<HcmDeductResponse>> {
    return this.hcm.callHcm(
      () => this.hcm.axios.post('/api/hcm/timeoff/deduct', payload),
      'hcm:deduct',
    );
  }

  reverse(payload: ReversePayload): Promise<HcmResult<HcmReverseResponse>> {
    return this.hcm.callHcm(
      () => this.hcm.axios.post('/api/hcm/timeoff/reverse', payload),
      'hcm:reverse',
    );
  }
}

