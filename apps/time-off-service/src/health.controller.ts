import { Controller, Get } from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { Outbox } from './modules/time-off/entities/outbox.entity';

@Controller('/health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async getHealth(): Promise<{ outboxPendingCount: number }> {
    const outboxPendingCount = await this.dataSource.getRepository(Outbox).count({
      where: { status: In(['PENDING', 'PROCESSING']) },
    });
    return { outboxPendingCount };
  }
}
