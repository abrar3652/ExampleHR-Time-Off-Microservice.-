export declare enum LeaveType {
    ANNUAL = "ANNUAL",
    SICK = "SICK",
    UNPAID = "UNPAID",
    MATERNITY = "MATERNITY",
    PATERNITY = "PATERNITY"
}
export declare enum RequestState {
    SUBMITTED = "SUBMITTED",
    PENDING_HCM = "PENDING_HCM",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED",
    FAILED = "FAILED",
    CANCELLING = "CANCELLING",
    CANCELLED = "CANCELLED"
}
export declare enum OutboxEventType {
    HCM_DEDUCT = "HCM_DEDUCT",
    HCM_REVERSE = "HCM_REVERSE"
}
export declare enum BalanceChangeSource {
    REQUEST = "REQUEST",
    BATCH_SYNC = "BATCH_SYNC",
    REAL_TIME_SYNC = "REAL_TIME_SYNC",
    AUTO_RECONCILE = "AUTO_RECONCILE",
    MANUAL = "MANUAL"
}
