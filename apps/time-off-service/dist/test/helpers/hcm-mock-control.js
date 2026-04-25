"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HcmMockControl = void 0;
class HcmMockControl {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async setBalance(employeeId, locationId, leaveType, balance) {
        await this.post('/__control/balance', {
            employeeId,
            locationId,
            leaveType,
            totalDays: balance.totalDays,
            usedDays: balance.usedDays,
            hcmLastUpdatedAt: balance.hcmLastUpdatedAt,
        });
    }
    async setNextCallBehavior(endpoint, behavior, count) {
        await this.post('/__control/behavior', {
            endpoint,
            behavior,
            count,
        });
    }
    async reset() {
        await this.post('/__control/reset', {});
    }
    async getCallLog() {
        const response = await fetch(`${this.baseUrl}/__control/call-log`);
        if (!response.ok)
            throw new Error(`HCM call-log failed: ${response.status}`);
        return (await response.json());
    }
    async advanceClock(ms) {
        await this.post('/__control/advance-clock', { milliseconds: ms });
    }
    async post(path, body) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok)
            throw new Error(`HCM control ${path} failed: ${response.status}`);
    }
}
exports.HcmMockControl = HcmMockControl;
//# sourceMappingURL=hcm-mock-control.js.map