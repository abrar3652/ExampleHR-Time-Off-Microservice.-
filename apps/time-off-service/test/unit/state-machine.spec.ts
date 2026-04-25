import { RequestState } from '../../src/domain/enums';
import { InvalidStateTransitionException } from '../../src/domain/exceptions';
import { RequestStateMachine } from '../../src/domain/state-machine';

const ALL_STATES: RequestState[] = [
  RequestState.SUBMITTED,
  RequestState.PENDING_HCM,
  RequestState.APPROVED,
  RequestState.REJECTED,
  RequestState.FAILED,
  RequestState.CANCELLING,
  RequestState.CANCELLED,
];

const VALID_TRANSITIONS: Array<[from: RequestState, to: RequestState]> = [
  [RequestState.SUBMITTED, RequestState.PENDING_HCM],
  [RequestState.SUBMITTED, RequestState.CANCELLED],
  [RequestState.PENDING_HCM, RequestState.APPROVED],
  [RequestState.PENDING_HCM, RequestState.REJECTED],
  [RequestState.PENDING_HCM, RequestState.FAILED],
  [RequestState.APPROVED, RequestState.CANCELLING],
  [RequestState.CANCELLING, RequestState.CANCELLED],
  [RequestState.CANCELLING, RequestState.FAILED],
  [RequestState.FAILED, RequestState.SUBMITTED],
];

const VALID_MAP: Record<RequestState, RequestState[]> = {
  [RequestState.SUBMITTED]: [RequestState.PENDING_HCM, RequestState.CANCELLED],
  [RequestState.PENDING_HCM]: [RequestState.APPROVED, RequestState.REJECTED, RequestState.FAILED],
  [RequestState.APPROVED]: [RequestState.CANCELLING],
  [RequestState.CANCELLING]: [RequestState.CANCELLED, RequestState.FAILED],
  [RequestState.FAILED]: [RequestState.SUBMITTED],
  [RequestState.REJECTED]: [],
  [RequestState.CANCELLED]: [],
};

describe('RequestStateMachine (exhaustive transition matrix)', () => {
  it.each(VALID_TRANSITIONS)('allows %s -> %s', (from, to) => {
    expect(() => RequestStateMachine.transition(from, to)).not.toThrow();
  });

  it('rejects every invalid transition for every state', () => {
    const validPairs = new Set(VALID_TRANSITIONS.map(([f, t]) => `${f}=>${t}`));

    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        if (validPairs.has(`${from}=>${to}`)) continue;

        expect(() => RequestStateMachine.transition(from, to)).toThrow(InvalidStateTransitionException);
      }
    }
  });

  it('getValidTransitions returns the correct list per state', () => {
    for (const from of ALL_STATES) {
      expect(RequestStateMachine.getValidTransitions(from)).toEqual(VALID_MAP[from]);
    }
  });
});

