import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HcmBalanceFetcher } from './hcm-balance-fetcher.service';
import { HcmClient } from './hcm-client.service';
import { HcmDeductionWriter } from './hcm-deduction-writer.service';

@Module({
  imports: [ConfigModule],
  providers: [HcmClient, HcmBalanceFetcher, HcmDeductionWriter],
  exports: [HcmClient, HcmBalanceFetcher, HcmDeductionWriter],
})
export class HcmClientModule {}

