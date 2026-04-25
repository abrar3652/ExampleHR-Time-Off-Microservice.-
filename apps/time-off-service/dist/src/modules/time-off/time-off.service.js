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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeOffService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const enums_1 = require("../../domain/enums");
const exceptions_1 = require("../../domain/exceptions");
const state_machine_1 = require("../../domain/state-machine");
const balance_repository_1 = require("../balance/balance.repository");
const balance_service_1 = require("../balance/balance.service");
const balance_entity_1 = require("../balance/entities/balance.entity");
const balance_change_log_entity_1 = require("../balance/entities/balance-change-log.entity");
const outbox_entity_1 = require("./entities/outbox.entity");
const request_audit_log_entity_1 = require("./entities/request-audit-log.entity");
const time_off_request_entity_1 = require("./entities/time-off-request.entity");
let TimeOffService = class TimeOffService {
    dataSource;
    balanceService;
    balanceRepository;
    constructor(dataSource, balanceService, balanceRepository) {
        this.dataSource = dataSource;
        this.balanceService = balanceService;
        this.balanceRepository = balanceRepository;
    }
    async createRequest(dto, employeeId, idempotencyKey) {
        this.validateDto(dto);
        const computedDays = this.computeBusinessDays(dto.startDate, dto.endDate);
        if (Math.abs(computedDays - dto.daysRequested) > 0.001) {
            throw new common_1.BadRequestException('daysRequested must match computed business days');
        }
        await this.balanceService.getOrFetchBalance(employeeId, dto.locationId, dto.leaveType);
        const created = await this.balanceService.withBalanceLock(employeeId, dto.locationId, dto.leaveType, async (manager) => {
            const locked = await this.balanceRepository.lockRow(manager, employeeId, dto.locationId, dto.leaveType);
            if (!locked) {
                throw new common_1.BadRequestException('Balance row missing under lock');
            }
            const availableDays = locked.totalDays - locked.usedDays - locked.pendingDays;
            if (availableDays < dto.daysRequested) {
                throw new exceptions_1.InsufficientBalanceException();
            }
            const now = new Date().toISOString();
            const requestId = (0, node_crypto_1.randomUUID)();
            const request = manager.create(time_off_request_entity_1.TimeOffRequest, {
                id: requestId,
                idempotencyKey,
                employeeId,
                locationId: dto.locationId,
                leaveType: dto.leaveType,
                startDate: dto.startDate,
                endDate: dto.endDate,
                daysRequested: dto.daysRequested,
                state: enums_1.RequestState.SUBMITTED,
                lastOutboxEvent: enums_1.OutboxEventType.HCM_DEDUCT,
                hcmExternalRef: requestId,
                hcmTransactionId: null,
                hcmResponseCode: null,
                hcmResponseBody: null,
                rejectionReason: null,
                failureReason: null,
                retryCount: 0,
                createdBy: employeeId,
                approvedBy: null,
                createdAt: now,
                updatedAt: now,
            });
            const outbox = manager.create(outbox_entity_1.Outbox, {
                id: (0, node_crypto_1.randomUUID)(),
                eventType: enums_1.OutboxEventType.HCM_DEDUCT,
                payload: JSON.stringify({
                    requestId,
                    employeeId,
                    locationId: dto.locationId,
                    leaveType: dto.leaveType,
                    daysRequested: dto.daysRequested,
                    startDate: dto.startDate,
                    endDate: dto.endDate,
                    externalRef: requestId,
                }),
                requestId,
                status: 'PENDING',
                attempts: 0,
                lastAttemptedAt: null,
                lastError: null,
                createdAt: now,
                processAfter: now,
            });
            locked.pendingDays += dto.daysRequested;
            locked.updatedAt = now;
            await manager.getRepository(time_off_request_entity_1.TimeOffRequest).insert(request);
            await manager.getRepository(outbox_entity_1.Outbox).insert(outbox);
            await manager.query('UPDATE balance SET pending_days = pending_days + ?, updated_at = ? WHERE employee_id = ? AND location_id = ? AND leave_type = ?', [dto.daysRequested, now, employeeId, dto.locationId, dto.leaveType]);
            await manager.getRepository(request_audit_log_entity_1.RequestAuditLog).insert(manager.create(request_audit_log_entity_1.RequestAuditLog, {
                id: (0, node_crypto_1.randomUUID)(),
                requestId,
                fromState: null,
                toState: enums_1.RequestState.SUBMITTED,
                actor: employeeId,
                reason: null,
                metadata: null,
                createdAt: now,
            }));
            return requestId;
        });
        return {
            requestId: created,
            state: enums_1.RequestState.SUBMITTED,
            message: 'Request submitted. Awaiting HCM confirmation.',
            estimatedResolutionSeconds: 30,
        };
    }
    async getRequestById(requestId) {
        const row = await this.dataSource.getRepository(time_off_request_entity_1.TimeOffRequest).findOneByOrFail({ id: requestId });
        return {
            requestId: row.id,
            employeeId: row.employeeId,
            locationId: row.locationId,
            leaveType: row.leaveType,
            startDate: row.startDate,
            endDate: row.endDate,
            daysRequested: row.daysRequested,
            state: row.state,
            hcmExternalRef: row.hcmExternalRef,
            rejectionReason: row.rejectionReason,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
    async cancelRequest(requestId, employeeId) {
        const req = await this.dataSource.getRepository(time_off_request_entity_1.TimeOffRequest).findOneBy({ id: requestId });
        if (!req)
            throw new exceptions_1.RequestNotFoundError(`Request ${requestId} not found`);
        if (req.state === enums_1.RequestState.SUBMITTED) {
            await this.balanceService.withBalanceLock(req.employeeId, req.locationId, req.leaveType, async (manager) => {
                const bal = await this.balanceRepository.lockRow(manager, req.employeeId, req.locationId, req.leaveType);
                if (!bal)
                    throw new exceptions_1.RequestNotFoundError(`Balance missing for request ${requestId}`);
                state_machine_1.RequestStateMachine.transition(enums_1.RequestState.SUBMITTED, enums_1.RequestState.CANCELLED);
                const now = new Date().toISOString();
                const oldPending = bal.pendingDays;
                const nextPending = Math.max(0, oldPending - req.daysRequested);
                await manager.getRepository(time_off_request_entity_1.TimeOffRequest).update({ id: req.id }, { state: enums_1.RequestState.CANCELLED, lastOutboxEvent: null, updatedAt: now });
                await manager.getRepository(balance_entity_1.Balance).update({ id: bal.id }, { pendingDays: nextPending, updatedAt: now });
                if (oldPending !== nextPending) {
                    await manager.getRepository(balance_change_log_entity_1.BalanceChangeLog).insert({
                        id: (0, node_crypto_1.randomUUID)(),
                        balanceId: bal.id,
                        employeeId: bal.employeeId,
                        locationId: bal.locationId,
                        leaveType: bal.leaveType,
                        fieldChanged: 'pending_days',
                        oldValue: oldPending,
                        newValue: nextPending,
                        delta: nextPending - oldPending,
                        source: enums_1.BalanceChangeSource.REQUEST,
                        sourceRef: req.id,
                        hcmTimestamp: null,
                        createdAt: now,
                    });
                }
                await manager.getRepository(request_audit_log_entity_1.RequestAuditLog).insert({
                    id: (0, node_crypto_1.randomUUID)(),
                    requestId: req.id,
                    fromState: enums_1.RequestState.SUBMITTED,
                    toState: enums_1.RequestState.CANCELLED,
                    actor: employeeId,
                    reason: null,
                    metadata: null,
                    createdAt: now,
                });
            });
            return { requestId, state: enums_1.RequestState.CANCELLED, message: 'Request cancelled successfully.' };
        }
        if (req.state === enums_1.RequestState.APPROVED) {
            state_machine_1.RequestStateMachine.transition(enums_1.RequestState.APPROVED, enums_1.RequestState.CANCELLING);
            const now = new Date().toISOString();
            await this.dataSource.transaction(async (manager) => {
                await manager.getRepository(time_off_request_entity_1.TimeOffRequest).update({ id: req.id }, {
                    state: enums_1.RequestState.CANCELLING,
                    lastOutboxEvent: enums_1.OutboxEventType.HCM_REVERSE,
                    updatedAt: now,
                });
                await manager.getRepository(outbox_entity_1.Outbox).insert({
                    id: (0, node_crypto_1.randomUUID)(),
                    eventType: enums_1.OutboxEventType.HCM_REVERSE,
                    payload: JSON.stringify({
                        requestId: req.id,
                        hcmTransactionId: req.hcmTransactionId ?? req.hcmExternalRef,
                        externalRef: req.hcmExternalRef ?? req.id,
                        employeeId: req.employeeId,
                        locationId: req.locationId,
                        leaveType: req.leaveType,
                        days: req.daysRequested,
                    }),
                    requestId: req.id,
                    status: 'PENDING',
                    attempts: 0,
                    createdAt: now,
                    processAfter: now,
                });
                await manager.getRepository(request_audit_log_entity_1.RequestAuditLog).insert({
                    id: (0, node_crypto_1.randomUUID)(),
                    requestId: req.id,
                    fromState: enums_1.RequestState.APPROVED,
                    toState: enums_1.RequestState.CANCELLING,
                    actor: employeeId,
                    reason: 'CANCELLATION_INITIATED',
                    metadata: null,
                    createdAt: now,
                });
            });
            return { requestId, state: enums_1.RequestState.CANCELLING, message: 'Reversal initiated.' };
        }
        throw new exceptions_1.InvalidStateTransitionException(`Cannot cancel request in ${req.state} state`);
    }
    validateDto(dto) {
        if (dto.daysRequested <= 0) {
            throw new common_1.BadRequestException('daysRequested must be > 0');
        }
        if (Math.abs(dto.daysRequested * 2 - Math.round(dto.daysRequested * 2)) > 0.000001) {
            throw new common_1.BadRequestException('daysRequested must be a multiple of 0.5');
        }
        if (!Object.values(enums_1.LeaveType).includes(dto.leaveType)) {
            throw new common_1.BadRequestException('leaveType is invalid');
        }
        if (new Date(dto.startDate).getTime() >= new Date(dto.endDate).getTime()) {
            throw new common_1.BadRequestException('startDate must be before endDate');
        }
    }
    computeBusinessDays(startDate, endDate) {
        const start = new Date(`${startDate}T00:00:00.000Z`);
        const end = new Date(`${endDate}T00:00:00.000Z`);
        let days = 0;
        for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
            const day = d.getUTCDay();
            if (day !== 0 && day !== 6)
                days += 1;
        }
        return days;
    }
};
exports.TimeOffService = TimeOffService;
exports.TimeOffService = TimeOffService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        balance_service_1.BalanceService,
        balance_repository_1.BalanceRepository])
], TimeOffService);
//# sourceMappingURL=time-off.service.js.map