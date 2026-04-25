import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { IdempotencyRecord } from './entities/idempotency-record.entity';

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly dataSource: DataSource) {}

  findByKey(key: string): Promise<IdempotencyRecord | null> {
    return this.dataSource.getRepository(IdempotencyRecord).findOne({ where: { idempotencyKey: key } });
  }

  insertInProgress(
    key: string,
    requestBody: string,
    expiresAt: string,
    createdAt: string,
  ): Promise<void> {
    return this.dataSource
      .getRepository(IdempotencyRecord)
      .insert({
        idempotencyKey: key,
        status: 'IN_PROGRESS',
        requestBody,
        expiresAt,
        createdAt,
      })
      .then(() => undefined);
  }

  async markComplete(key: string, statusCode: number, responseBody: string): Promise<void> {
    await this.dataSource.getRepository(IdempotencyRecord).update(
      { idempotencyKey: key },
      {
        status: 'COMPLETE',
        responseStatus: statusCode,
        responseBody,
      },
    );
  }

  async delete(key: string): Promise<void> {
    await this.dataSource.getRepository(IdempotencyRecord).delete({ idempotencyKey: key });
  }

  async deleteExpired(nowIso: string): Promise<number> {
    const result = await this.dataSource
      .getRepository(IdempotencyRecord)
      .createQueryBuilder()
      .delete()
      .where('expires_at < :nowIso', { nowIso })
      .execute();

    return result.affected ?? 0;
  }
}

