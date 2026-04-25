"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalanceChangeSource = exports.OutboxEventType = exports.RequestState = exports.LeaveType = void 0;
var LeaveType;
(function (LeaveType) {
    LeaveType["ANNUAL"] = "ANNUAL";
    LeaveType["SICK"] = "SICK";
    LeaveType["UNPAID"] = "UNPAID";
    LeaveType["MATERNITY"] = "MATERNITY";
    LeaveType["PATERNITY"] = "PATERNITY";
})(LeaveType || (exports.LeaveType = LeaveType = {}));
var RequestState;
(function (RequestState) {
    RequestState["SUBMITTED"] = "SUBMITTED";
    RequestState["PENDING_HCM"] = "PENDING_HCM";
    RequestState["APPROVED"] = "APPROVED";
    RequestState["REJECTED"] = "REJECTED";
    RequestState["FAILED"] = "FAILED";
    RequestState["CANCELLING"] = "CANCELLING";
    RequestState["CANCELLED"] = "CANCELLED";
})(RequestState || (exports.RequestState = RequestState = {}));
var OutboxEventType;
(function (OutboxEventType) {
    OutboxEventType["HCM_DEDUCT"] = "HCM_DEDUCT";
    OutboxEventType["HCM_REVERSE"] = "HCM_REVERSE";
})(OutboxEventType || (exports.OutboxEventType = OutboxEventType = {}));
var BalanceChangeSource;
(function (BalanceChangeSource) {
    BalanceChangeSource["REQUEST"] = "REQUEST";
    BalanceChangeSource["BATCH_SYNC"] = "BATCH_SYNC";
    BalanceChangeSource["REAL_TIME_SYNC"] = "REAL_TIME_SYNC";
    BalanceChangeSource["AUTO_RECONCILE"] = "AUTO_RECONCILE";
    BalanceChangeSource["MANUAL"] = "MANUAL";
})(BalanceChangeSource || (exports.BalanceChangeSource = BalanceChangeSource = {}));
//# sourceMappingURL=enums.js.map