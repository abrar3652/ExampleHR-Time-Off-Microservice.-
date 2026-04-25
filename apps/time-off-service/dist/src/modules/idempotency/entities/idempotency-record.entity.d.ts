export declare class IdempotencyRecord {
    idempotencyKey: string;
    status: 'IN_PROGRESS' | 'COMPLETE';
    responseStatus: number | null;
    responseBody: string | null;
    requestBody: string | null;
    expiresAt: string;
    createdAt: string;
}
