export declare class HcmMockControl {
    private readonly baseUrl;
    constructor(baseUrl: string);
    setBalance(employeeId: string, locationId: string, leaveType: string, balance: {
        totalDays: number;
        usedDays: number;
        hcmLastUpdatedAt: string;
    }): Promise<void>;
    setNextCallBehavior(endpoint: string, behavior: 'timeout' | '500' | '409' | 'slow' | 'silent_success' | 'invalid_validation', count: number): Promise<void>;
    reset(): Promise<void>;
    getCallLog(): Promise<Array<{
        endpoint: string;
        method: string;
        responseStatus: number;
        chaosApplied: string | null;
        calledAt: string;
    }>>;
    advanceClock(ms: number): Promise<void>;
    private post;
}
