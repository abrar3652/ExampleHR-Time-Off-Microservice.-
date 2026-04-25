import { IdempotencyRepository } from './idempotency.repository';
export declare class IdempotencyCleanupJob {
    private readonly repo;
    constructor(repo: IdempotencyRepository);
    cleanup(): Promise<void>;
}
