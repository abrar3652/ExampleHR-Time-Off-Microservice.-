import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { HcmInternalClock } from '../entities/hcm-internal-clock.entity';

@Injectable()
export class HcmClockService {
  constructor(private readonly dataSource: DataSource) {}

  async nowIso(): Promise<string> {
    const clock = await this.dataSource.getRepository(HcmInternalClock).findOneBy({ id: 'singleton' });
    const offsetMs = clock?.offsetMs ?? 0;
    return new Date(Date.now() + offsetMs).toISOString();
  }

  async advance(milliseconds: number): Promise<number> {
    const repo = this.dataSource.getRepository(HcmInternalClock);
    const existing = await repo.findOneBy({ id: 'singleton' });
    const offsetMs = (existing?.offsetMs ?? 0) + milliseconds;
    await repo.upsert({ id: 'singleton', offsetMs }, ['id']);
    return offsetMs;
  }

  async reset(): Promise<void> {
    await this.dataSource.getRepository(HcmInternalClock).upsert({ id: 'singleton', offsetMs: 0 }, ['id']);
  }
}
