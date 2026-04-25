"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestStateMachine = void 0;
const enums_1 = require("./enums");
const exceptions_1 = require("./exceptions");
class RequestStateMachine {
    static transition(from, to) {
        const valid = this.getValidTransitions(from);
        if (!valid.includes(to)) {
            throw new exceptions_1.InvalidStateTransitionException(`Invalid transition: ${from} -> ${to}`);
        }
    }
    static getValidTransitions(from) {
        switch (from) {
            case enums_1.RequestState.SUBMITTED: {
                return [enums_1.RequestState.PENDING_HCM, enums_1.RequestState.CANCELLED];
            }
            case enums_1.RequestState.PENDING_HCM: {
                return [enums_1.RequestState.APPROVED, enums_1.RequestState.REJECTED, enums_1.RequestState.FAILED];
            }
            case enums_1.RequestState.APPROVED: {
                return [enums_1.RequestState.CANCELLING];
            }
            case enums_1.RequestState.CANCELLING: {
                return [enums_1.RequestState.CANCELLED, enums_1.RequestState.FAILED];
            }
            case enums_1.RequestState.FAILED: {
                return [enums_1.RequestState.SUBMITTED];
            }
            case enums_1.RequestState.REJECTED: {
                return [];
            }
            case enums_1.RequestState.CANCELLED: {
                return [];
            }
            default: {
                return [];
            }
        }
    }
}
exports.RequestStateMachine = RequestStateMachine;
//# sourceMappingURL=state-machine.js.map