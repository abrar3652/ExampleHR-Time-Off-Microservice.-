"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OutboxProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxProcessor = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const enums_1 = require("../../domain/enums");
const state_machine_1 = require("../../domain/state-machine");
const balance_change_log_entity_1 = require("../balance/entities/balance-change-log.entity");
const balance_entity_1 = require("../balance/entities/balance.entity");
const hcm_deduction_writer_service_1 = require("../hcm-client/hcm-deduction-writer.service");
const outbox_entity_1 = require("../time-off/entities/outbox.entity");
const request_audit_log_entity_1 = require("../time-off/entities/request-audit-log.entity");
const time_off_request_entity_1 = require("../time-off/entities/time-off-request.entity");
const outbox_repository_1 = require("./outbox.repository");
const MAX_OUTBOX_ATTEMPTS = 3;
let OutboxProcessor = OutboxProcessor_1 = class OutboxProcessor {
    dataSource;
    outboxRepo;
    hcmWriter;
    logger = new common_1.Logger(OutboxProcessor_1.name);
    constructor(dataSource, outboxRepo, hcmWriter) {
        this.dataSource = dataSource;
        this.outboxRepo = outboxRepo;
        this.hcmWriter = hcmWriter;
    }
    async process(record) {
        const nextAttempt = record.attempts + 1;
        await this.dataSource.getRepository(outbox_entity_1.Outbox).update({ id: record.id }, { attempts: nextAttempt, lastAttemptedAt: new Date().toISOString(), status: 'PROCESSING' });
        const current = await this.dataSource.getRepository(outbox_entity_1.Outbox).findOneByOrFail({ id: record.id });
        if (current.attempts > MAX_OUTBOX_ATTEMPTS) {
            await this.markFailed(current, 'SAFETY_GUARD_EXCEEDED');
            return;
        }
        if (current.eventType === enums_1.OutboxEventType.HCM_DEDUCT) {
            await this.handleDeduct(current);
            return;
        }
        await this.handleReverse(current);
    }
    async handleDeduct(record) {
        const req = await this.dataSource.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: record.requestId });
        if (req.state === enums_1.RequestState.SUBMITTED) {
            state_machine_1.RequestStateMachine.transition(enums_1.RequestState.SUBMITTED, enums_1.RequestState.PENDING_HCM);
            await this.dataSource.getRepository(time_off_request_entity_1.TimeOffRequest).update({ id: req.id }, { state: enums_1.RequestState.PENDING_HCM, updatedAt: new Date().toISOString() });
            await this.writeAudit(req.id, enums_1.RequestState.SUBMITTED, enums_1.RequestState.PENDING_HCM, 'SYSTEM');
            req.state = enums_1.RequestState.PENDING_HCM;
        }
        const payload = JSON.parse(record.payload);
        const result = await this.hcmWriter.deduct({
            externalRef: payload.externalRef,
            employeeId: payload.employeeId,
            locationId: payload.locationId,
            leaveType: payload.leaveType,
            days: payload.daysRequested,
            startDate: payload.startDate,
            endDate: payload.endDate,
        });
        if (result.success || (result.reason === 'CLIENT_ERROR' && result.statusCode === 409)) {
            await this.handleApprove(record, req, result);
            return;
        }
        if (result.reason === 'CLIENT_ERROR') {
            await this.handleReject(record, req, result);
            return;
        }
        if (record.attempts >= MAX_OUTBOX_ATTEMPTS) {
            await this.markFailed(record, result.reason);
        }
        else {
            await this.outboxRepo.scheduleRetry(record.id, record.attempts, result.reason);
        }
    }
    async handleReverse(record) {
        const req = await this.dataSource.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: record.requestId });
        const payload = JSON.parse(record.payload);
        const result = await this.hcmWriter.reverse(payload);
        if (result.success || (result.reason === 'CLIENT_ERROR' && result.statusCode === 409)) {
            const bal = await this.dataSource.getRepository(balance_entity_1.Balance).findOneByOrFail({
                employeeId: req.employeeId,
                locationId: req.locationId,
                leaveType: req.leaveType,
            });
            const oldUsed = bal.usedDays;
            const newUsed = Number((result.success ? result.data : result.body)?.newUsedDays ?? Math.max(0, oldUsed - req.daysRequested));
            await this.dataSource.getRepository(balance_entity_1.Balance).update({ id: bal.id }, {
                usedDays: newUsed,
                hcmLastUpdatedAt: (result.success ? result.data : result.body)?.lastUpdatedAt ?? bal.hcmLastUpdatedAt,
                syncedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            await this.writeBalanceChange(bal, 'used_days', oldUsed, newUsed, req.id, (result.success ? result.data : result.body)?.lastUpdatedAt ?? null);
            state_machine_1.RequestStateMachine.transition(req.state, enums_1.RequestState.CANCELLED);
            await this.dataSource.getRepository(time_off_request_entity_1.TimeOffRequest).update({ id: req.id }, { state: enums_1.RequestState.CANCELLED, lastOutboxEvent: null, updatedAt: new Date().toISOString() });
            await this.outboxRepo.markDone(record.id);
            await this.writeAudit(req.id, req.state, enums_1.RequestState.CANCELLED, 'HCM_RESPONSE');
            return;
        }
        if (result.reason === 'CLIENT_ERROR') {
            await this.markFailed(record, 'REVERSAL_REJECTED');
            return;
        }
        if (record.attempts >= MAX_OUTBOX_ATTEMPTS) {
            await this.markFailed(record, result.reason);
        }
        else {
            await this.outboxRepo.scheduleRetry(record.id, record.attempts, result.reason);
        }
    }
    async handleApprove(record, req, result) {
        const bal = await this.dataSource.getRepository(balance_entity_1.Balance).findOneByOrFail({
            employeeId: req.employeeId,
            locationId: req.locationId,
            leaveType: req.leaveType,
        });
        const data = result.success ? result.data : result.body;
        const newUsed = Number(data?.newUsedDays ?? bal.usedDays + req.daysRequested);
        const oldUsed = bal.usedDays;
        const oldPending = bal.pendingDays;
        const now = new Date().toISOString();
        await this.dataSource.getRepository(balance_entity_1.Balance).update({ id: bal.id }, {
            usedDays: newUsed,
            pendingDays: Math.max(0, bal.pendingDays - req.daysRequested),
            hcmLastUpdatedAt: data?.lastUpdatedAt ?? bal.hcmLastUpdatedAt,
            syncedAt: now,
            updatedAt: now,
        });
        await this.writeBalanceChange(bal, 'used_days', oldUsed, newUsed, req.id, data?.lastUpdatedAt ?? null);
        await this.writeBalanceChange(bal, 'pending_days', oldPending, Math.max(0, oldPending - req.daysRequested), req.id, data?.lastUpdatedAt ?? null);
        state_machine_1.RequestStateMachine.transition(req.state, enums_1.RequestState.APPROVED);
        await this.dataSource.getRepository(time_off_request_entity_1.TimeOffRequest).update({ id: req.id }, {
            state: enums_1.RequestState.APPROVED,
            lastOutboxEvent: null,
            hcmResponseCode: result.statusCode ?? 200,
            hcmResponseBody: JSON.stringify(result.data ?? result.body ?? null),
            updatedAt: now,
        });
        await this.outboxRepo.markDone(record.id);
        await this.writeAudit(req.id, req.state, enums_1.RequestState.APPROVED, 'HCM_RESPONSE');
    }
    async handleReject(record, req, result) {
        const bal = await this.dataSource.getRepository(balance_entity_1.Balance).findOneByOrFail({
            employeeId: req.employeeId,
            locationId: req.locationId,
            leaveType: req.leaveType,
        });
        const oldPending = bal.pendingDays;
        const nextPending = Math.max(0, oldPending - req.daysRequested);
        await this.dataSource
            .getRepository(balance_entity_1.Balance)
            .update({ id: bal.id }, { pendingDays: nextPending, updatedAt: new Date().toISOString() });
        await this.writeBalanceChange(bal, 'pending_days', oldPending, nextPending, req.id, null);
        state_machine_1.RequestStateMachine.transition(req.state, enums_1.RequestState.REJECTED);
        await this.dataSource.getRepository(time_off_request_entity_1.TimeOffRequest).update({ id: req.id }, {
            state: enums_1.RequestState.REJECTED,
            lastOutboxEvent: null,
            hcmResponseCode: result.statusCode ?? 400,
            hcmResponseBody: JSON.stringify(('body' in result ? result.body : null) ?? null),
            rejectionReason: ('body' in result ? result.body : null)?.message ??
                'HCM rejected request',
            updatedAt: new Date().toISOString(),
        });
        await this.outboxRepo.markDone(record.id);
        await this.writeAudit(req.id, req.state, enums_1.RequestState.REJECTED, 'HCM_RESPONSE');
    }
    async markFailed(record, reason) {
        const req = await this.dataSource.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: record.requestId });
        const bal = await this.dataSource.getRepository(balance_entity_1.Balance).findOneByOrFail({
            employeeId: req.employeeId,
            locationId: req.locationId,
            leaveType: req.leaveType,
        });
        const oldPending = bal.pendingDays;
        const nextPending = Math.max(0, oldPending - req.daysRequested);
        await this.dataSource
            .getRepository(balance_entity_1.Balance)
            .update({ id: bal.id }, { pendingDays: nextPending, updatedAt: new Date().toISOString() });
        await this.writeBalanceChange(bal, 'pending_days', oldPending, nextPending, req.id, null);
        state_machine_1.RequestStateMachine.transition(req.state, enums_1.RequestState.FAILED);
        await this.dataSource.getRepository(time_off_request_entity_1.TimeOffRequest).update({ id: req.id }, {
            state: enums_1.RequestState.FAILED,
            failureReason: record.eventType === enums_1.OutboxEventType.HCM_DEDUCT ? 'DEDUCTION_FAILED' : 'REVERSAL_FAILED',
            lastOutboxEvent: null,
            updatedAt: new Date().toISOString(),
        });
        await this.outboxRepo.markFailed(record.id, reason);
        await this.writeAudit(req.id, req.state, enums_1.RequestState.FAILED, 'SYSTEM', 'OUTBOX_EXHAUSTED');
        this.logger.error({ outboxId: record.id, requestId: req.id, eventType: record.eventType, result: reason });
    }
    async writeAudit(requestId, fromState, toState, actor, reason = null) {
        await this.dataSource.getRepository(request_audit_log_entity_1.RequestAuditLog).insert({
            id: (0, node_crypto_1.randomUUID)(),
            requestId,
            fromState,
            toState,
            actor,
            reason,
            metadata: null,
            createdAt: new Date().toISOString(),
        });
    }
    async writeBalanceChange(bal, fieldChanged, oldValue, newValue, sourceRef, hcmTs) {
        if (oldValue === newValue)
            return;
        await this.dataSource.getRepository(balance_change_log_entity_1.BalanceChangeLog).insert({
            id: (0, node_crypto_1.randomUUID)(),
            balanceId: bal.id,
            employeeId: bal.employeeId,
            locationId: bal.locationId,
            leaveType: bal.leaveType,
            fieldChanged,
            oldValue,
            newValue,
            delta: newValue - oldValue,
            source: enums_1.BalanceChangeSource.REQUEST,
            sourceRef,
            hcmTimestamp: hcmTs,
            createdAt: new Date().toISOString(),
        });
    }
};
exports.OutboxProcessor = OutboxProcessor;
exports.OutboxProcessor = OutboxProcessor = OutboxProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        outbox_repository_1.OutboxRepository,
        hcm_deduction_writer_service_1.HcmDeductionWriter])
], OutboxProcessor);
//# sourceMappingURL=outbox.processor.js.map