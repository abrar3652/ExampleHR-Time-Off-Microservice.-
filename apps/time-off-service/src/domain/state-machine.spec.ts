import { RequestState } from './enums';
import { InvalidStateTransitionException } from './exceptions';
import { RequestStateMachine } from './state-machine';

describe('RequestStateMachine', () => {
  it('allows SUBMITTED -> PENDING_HCM', () => {
    expect(() =>
      RequestStateMachine.transition(RequestState.SUBMITTED, RequestState.PENDING_HCM),
    ).not.toThrow();
  });

  it('rejects APPROVED -> SUBMITTED', () => {
    expect(() =>
      RequestStateMachine.transition(RequestState.APPROVED, RequestState.SUBMITTED),
    ).toThrow(InvalidStateTransitionException);
  });

  it('rejects CANCELLED -> APPROVED', () => {
    expect(() =>
      RequestStateMachine.transition(RequestState.CANCELLED, RequestState.APPROVED),
    ).toThrow(InvalidStateTransitionException);
  });
});

