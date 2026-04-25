export declare class ReconciliationLog {
    id: string;
    runId: string;
    employeeId: string;
    locationId: string;
    leaveType: string;
    driftField: string;
    localValue: number;
    hcmValue: number;
    adjustedLocal: number;
    drift: number;
    resolved: number;
    resolution: string | null;
    resolvedAt: string | null;
    createdAt: string;
}
