import { DataSource } from 'typeorm';
import { Outbox } from '../time-off/entities/outbox.entity';
export declare class OutboxRepository {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    claimPending(limit?: number): Promise<Outbox[]>;
    resetStuckProcessing(): Promise<void>;
    markDone(id: string): Promise<void>;
    scheduleRetry(id: string, attempt: number, reason: string): Promise<void>;
    markFailed(id: string, reason: string): Promise<void>;
}
