import { DataSource } from 'typeorm';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
export declare class IdempotencyRepository {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    findByKey(key: string): Promise<IdempotencyRecord | null>;
    insertInProgress(key: string, requestBody: string, expiresAt: string, createdAt: string): Promise<void>;
    markComplete(key: string, statusCode: number, responseBody: string): Promise<void>;
    delete(key: string): Promise<void>;
    deleteExpired(nowIso: string): Promise<number>;
}
