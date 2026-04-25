import { DataSource } from 'typeorm';
import { HcmDeductionWriter } from '../hcm-client/hcm-deduction-writer.service';
import { Outbox } from '../time-off/entities/outbox.entity';
import { OutboxRepository } from './outbox.repository';
export declare class OutboxProcessor {
    private readonly dataSource;
    private readonly outboxRepo;
    private readonly hcmWriter;
    private readonly logger;
    constructor(dataSource: DataSource, outboxRepo: OutboxRepository, hcmWriter: HcmDeductionWriter);
    process(record: Outbox): Promise<void>;
    private handleDeduct;
    private handleReverse;
    private handleApprove;
    private handleReject;
    private markFailed;
    private writeAudit;
    private writeBalanceChange;
}
