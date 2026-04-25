export class DomainException extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class InsufficientBalanceException extends DomainException {
  constructor(message = 'Insufficient balance') {
    super('INSUFFICIENT_BALANCE', message, 422);
  }
}

export class InvalidStateTransitionException extends DomainException {
  constructor(message = 'Invalid state transition') {
    super('INVALID_STATE_TRANSITION', message, 409);
  }
}

export class HcmUnavailableException extends DomainException {
  constructor(message = 'HCM unavailable') {
    super('HCM_UNAVAILABLE', message, 503);
  }
}

export class IdempotencyConflictException extends DomainException {
  constructor(message = 'Idempotency conflict') {
    super('IDEMPOTENCY_CONFLICT', message, 409);
  }
}

export class BalanceNotFoundError extends DomainException {
  constructor(message = 'Balance not found') {
    super('BALANCE_NOT_FOUND', message, 404);
  }
}

export class RequestNotFoundError extends DomainException {
  constructor(message = 'Request not found') {
    super('REQUEST_NOT_FOUND', message, 404);
  }
}

