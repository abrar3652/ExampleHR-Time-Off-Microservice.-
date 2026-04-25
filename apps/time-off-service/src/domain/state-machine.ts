import { RequestState } from './enums';
import { InvalidStateTransitionException } from './exceptions';

export class RequestStateMachine {
  static transition(from: RequestState, to: RequestState): void {
    const valid = this.getValidTransitions(from);
    if (!valid.includes(to)) {
      throw new InvalidStateTransitionException(`Invalid transition: ${from} -> ${to}`);
    }
  }

  static getValidTransitions(from: RequestState): RequestState[] {
    switch (from) {
      case RequestState.SUBMITTED: {
        return [RequestState.PENDING_HCM, RequestState.CANCELLED];
      }
      case RequestState.PENDING_HCM: {
        return [RequestState.APPROVED, RequestState.REJECTED, RequestState.FAILED];
      }
      case RequestState.APPROVED: {
        return [RequestState.CANCELLING];
      }
      case RequestState.CANCELLING: {
        return [RequestState.CANCELLED, RequestState.FAILED];
      }
      case RequestState.FAILED: {
        return [RequestState.SUBMITTED];
      }
      case RequestState.REJECTED: {
        return [];
      }
      case RequestState.CANCELLED: {
        return [];
      }
      default: {
        return [];
      }
    }
  }
}

