import { RequestState } from './enums';
export declare class RequestStateMachine {
    static transition(from: RequestState, to: RequestState): void;
    static getValidTransitions(from: RequestState): RequestState[];
}
