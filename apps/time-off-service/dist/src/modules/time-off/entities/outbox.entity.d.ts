import { OutboxEventType } from '../../../domain/enums';
export declare class Outbox {
    id: string;
    eventType: OutboxEventType;
    payload: string;
    requestId: string;
    status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
    attempts: number;
    lastAttemptedAt: string | null;
    lastError: string | null;
    createdAt: string;
    processAfter: string;
}
