import { OutboxProcessor } from './outbox.processor';
import { OutboxRepository } from './outbox.repository';
export declare class OutboxWorker {
    private readonly outboxRepo;
    private readonly processor;
    private readonly logger;
    constructor(outboxRepo: OutboxRepository, processor: OutboxProcessor);
    poll(): Promise<void>;
}
