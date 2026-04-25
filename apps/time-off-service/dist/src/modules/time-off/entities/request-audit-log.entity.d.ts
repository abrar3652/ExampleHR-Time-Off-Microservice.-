import { RequestState } from '../../../domain/enums';
export declare class RequestAuditLog {
    id: string;
    requestId: string;
    fromState: RequestState | null;
    toState: RequestState;
    actor: string;
    reason: string | null;
    metadata: string | null;
    createdAt: string;
}
