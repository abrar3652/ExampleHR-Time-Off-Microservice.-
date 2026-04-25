"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestNotFoundError = exports.BalanceNotFoundError = exports.IdempotencyConflictException = exports.HcmUnavailableException = exports.InvalidStateTransitionException = exports.InsufficientBalanceException = exports.DomainException = void 0;
class DomainException extends Error {
    code;
    statusCode;
    constructor(code, message, statusCode) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
    }
}
exports.DomainException = DomainException;
class InsufficientBalanceException extends DomainException {
    constructor(message = 'Insufficient balance') {
        super('INSUFFICIENT_BALANCE', message, 422);
    }
}
exports.InsufficientBalanceException = InsufficientBalanceException;
class InvalidStateTransitionException extends DomainException {
    constructor(message = 'Invalid state transition') {
        super('INVALID_STATE_TRANSITION', message, 409);
    }
}
exports.InvalidStateTransitionException = InvalidStateTransitionException;
class HcmUnavailableException extends DomainException {
    constructor(message = 'HCM unavailable') {
        super('HCM_UNAVAILABLE', message, 503);
    }
}
exports.HcmUnavailableException = HcmUnavailableException;
class IdempotencyConflictException extends DomainException {
    constructor(message = 'Idempotency conflict') {
        super('IDEMPOTENCY_CONFLICT', message, 409);
    }
}
exports.IdempotencyConflictException = IdempotencyConflictException;
class BalanceNotFoundError extends DomainException {
    constructor(message = 'Balance not found') {
        super('BALANCE_NOT_FOUND', message, 404);
    }
}
exports.BalanceNotFoundError = BalanceNotFoundError;
class RequestNotFoundError extends DomainException {
    constructor(message = 'Request not found') {
        super('REQUEST_NOT_FOUND', message, 404);
    }
}
exports.RequestNotFoundError = RequestNotFoundError;
//# sourceMappingURL=exceptions.js.map