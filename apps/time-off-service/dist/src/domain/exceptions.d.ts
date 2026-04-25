export declare class DomainException extends Error {
    readonly code: string;
    readonly statusCode: number;
    constructor(code: string, message: string, statusCode: number);
}
export declare class InsufficientBalanceException extends DomainException {
    constructor(message?: string);
}
export declare class InvalidStateTransitionException extends DomainException {
    constructor(message?: string);
}
export declare class HcmUnavailableException extends DomainException {
    constructor(message?: string);
}
export declare class IdempotencyConflictException extends DomainException {
    constructor(message?: string);
}
export declare class BalanceNotFoundError extends DomainException {
    constructor(message?: string);
}
export declare class RequestNotFoundError extends DomainException {
    constructor(message?: string);
}
