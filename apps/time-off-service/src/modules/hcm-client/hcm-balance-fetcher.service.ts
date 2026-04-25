import { Injectable } from '@nestjs/common';

import { HcmClient } from './hcm-client.service';
import type { HcmBalanceResponse, HcmResult } from './types';

@Injectable()
export class HcmBalanceFetcher {
  constructor(private readonly hcm: HcmClient) {}

  getBalance(
    employeeId: string,
    locationId: string,
    leaveType: string,
  ): Promise<HcmResult<HcmBalanceResponse>> {
    return this.hcm.callHcm(
      () => this.hcm.axios.get(`/api/hcm/balance/${employeeId}/${locationId}/${leaveType}`),
      `hcm:balance_get:${employeeId}:${locationId}:${leaveType}`,
    );
  }
}

