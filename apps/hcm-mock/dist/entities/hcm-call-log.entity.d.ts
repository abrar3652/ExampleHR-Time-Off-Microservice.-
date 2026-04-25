export declare class HcmCallLog {
    id: string;
    endpoint: string;
    method: string;
    requestBody: string | null;
    responseStatus: number;
    responseBody: string | null;
    chaosApplied: string | null;
    durationMs: number;
    calledAt: string;
}
