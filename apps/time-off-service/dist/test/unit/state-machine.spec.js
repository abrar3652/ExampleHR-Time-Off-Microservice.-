"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const enums_1 = require("../../src/domain/enums");
const exceptions_1 = require("../../src/domain/exceptions");
const state_machine_1 = require("../../src/domain/state-machine");
const ALL_STATES = [
    enums_1.RequestState.SUBMITTED,
    enums_1.RequestState.PENDING_HCM,
    enums_1.RequestState.APPROVED,
    enums_1.RequestState.REJECTED,
    enums_1.RequestState.FAILED,
    enums_1.RequestState.CANCELLING,
    enums_1.RequestState.CANCELLED,
];
const VALID_TRANSITIONS = [
    [enums_1.RequestState.SUBMITTED, enums_1.RequestState.PENDING_HCM],
    [enums_1.RequestState.SUBMITTED, enums_1.RequestState.CANCELLED],
    [enums_1.RequestState.PENDING_HCM, enums_1.RequestState.APPROVED],
    [enums_1.RequestState.PENDING_HCM, enums_1.RequestState.REJECTED],
    [enums_1.RequestState.PENDING_HCM, enums_1.RequestState.FAILED],
    [enums_1.RequestState.APPROVED, enums_1.RequestState.CANCELLING],
    [enums_1.RequestState.CANCELLING, enums_1.RequestState.CANCELLED],
    [enums_1.RequestState.CANCELLING, enums_1.RequestState.FAILED],
    [enums_1.RequestState.FAILED, enums_1.RequestState.SUBMITTED],
];
const VALID_MAP = {
    [enums_1.RequestState.SUBMITTED]: [enums_1.RequestState.PENDING_HCM, enums_1.RequestState.CANCELLED],
    [enums_1.RequestState.PENDING_HCM]: [enums_1.RequestState.APPROVED, enums_1.RequestState.REJECTED, enums_1.RequestState.FAILED],
    [enums_1.RequestState.APPROVED]: [enums_1.RequestState.CANCELLING],
    [enums_1.RequestState.CANCELLING]: [enums_1.RequestState.CANCELLED, enums_1.RequestState.FAILED],
    [enums_1.RequestState.FAILED]: [enums_1.RequestState.SUBMITTED],
    [enums_1.RequestState.REJECTED]: [],
    [enums_1.RequestState.CANCELLED]: [],
};
describe('RequestStateMachine (exhaustive transition matrix)', () => {
    it.each(VALID_TRANSITIONS)('allows %s -> %s', (from, to) => {
        expect(() => state_machine_1.RequestStateMachine.transition(from, to)).not.toThrow();
    });
    it('rejects every invalid transition for every state', () => {
        const validPairs = new Set(VALID_TRANSITIONS.map(([f, t]) => `${f}=>${t}`));
        for (const from of ALL_STATES) {
            for (const to of ALL_STATES) {
                if (validPairs.has(`${from}=>${to}`))
                    continue;
                expect(() => state_machine_1.RequestStateMachine.transition(from, to)).toThrow(exceptions_1.InvalidStateTransitionException);
            }
        }
    });
    it('getValidTransitions returns the correct list per state', () => {
        for (const from of ALL_STATES) {
            expect(state_machine_1.RequestStateMachine.getValidTransitions(from)).toEqual(VALID_MAP[from]);
        }
    });
    it('getValidTransitions returns empty for unknown state value', () => {
        expect(state_machine_1.RequestStateMachine.getValidTransitions('UNKNOWN')).toEqual([]);
    });
});
//# sourceMappingURL=state-machine.spec.js.map