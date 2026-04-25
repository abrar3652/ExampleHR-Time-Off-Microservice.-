import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';

import { BalanceChangeSource, LeaveType, OutboxEventType, RequestState } from '../../domain/enums';
import {
  InsufficientBalanceException,
  InvalidStateTransitionException,
  RequestNotFoundError,
} from '../../domain/exceptions';
import { RequestStateMachine } from '../../domain/state-machine';
import { BalanceRepository } from '../balance/balance.repository';
import { BalanceService } from '../balance/balance.service';
import { Balance } from '../balance/entities/balance.entity';
import { BalanceChangeLog } from '../balance/entities/balance-change-log.entity';
import { Outbox } from './entities/outbox.entity';
import { RequestAuditLog } from './entities/request-audit-log.entity';
import { TimeOffRequest } from './entities/time-off-request.entity';

export interface CreateTimeOffRequestDto {
  locationId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysRequested: number;
  note?: string;
}

@Injectable()
export class TimeOffService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly balanceService: BalanceService,
    private readonly balanceRepository: BalanceRepository,
  ) {}

  async createRequest(
    dto: CreateTimeOffRequestDto,
    employeeId: string,
    idempotencyKey: string,
  ): Promise<{ requestId: string; state: RequestState.SUBMITTED; message: string; estimatedResolutionSeconds: number }> {
    this.validateDto(dto);

    const computedDays = this.computeBusinessDays(dto.startDate, dto.endDate);
    if (Math.abs(computedDays - dto.daysRequested) > 0.001) {
      throw new BadRequestException('daysRequested must match computed business days');
    }

    await this.balanceService.getOrFetchBalance(employeeId, dto.locationId, dto.leaveType);

    const created = await this.balanceService.withBalanceLock(
      employeeId,
      dto.locationId,
      dto.leaveType,
      async (manager: EntityManager) => {
        const locked = await this.balanceRepository.lockRow(
          manager,
          employeeId,
          dto.locationId,
          dto.leaveType,
        );
        if (!locked) {
          throw new BadRequestException('Balance row missing under lock');
        }

        const availableDays = locked.totalDays - locked.usedDays - locked.pendingDays;
        if (availableDays < dto.daysRequested) {
          throw new InsufficientBalanceException();
        }

        const now = new Date().toISOString();
        const requestId = randomUUID();

        const request = manager.create(TimeOffRequest, {
          id: requestId,
          idempotencyKey,
          employeeId,
          locationId: dto.locationId,
          leaveType: dto.leaveType,
          startDate: dto.startDate,
          endDate: dto.endDate,
          daysRequested: dto.daysRequested,
          state: RequestState.SUBMITTED,
          lastOutboxEvent: OutboxEventType.HCM_DEDUCT,
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

        const outbox = manager.create(Outbox, {
          id: randomUUID(),
          eventType: OutboxEventType.HCM_DEDUCT,
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

        await manager.getRepository(TimeOffRequest).insert(request);
        await manager.getRepository(Outbox).insert(outbox);
        await manager.query(
          'UPDATE balance SET pending_days = pending_days + ?, updated_at = ? WHERE employee_id = ? AND location_id = ? AND leave_type = ?',
          [dto.daysRequested, now, employeeId, dto.locationId, dto.leaveType],
        );
        await manager.getRepository(RequestAuditLog).insert(
          manager.create(RequestAuditLog, {
            id: randomUUID(),
            requestId,
            fromState: null,
            toState: RequestState.SUBMITTED,
            actor: employeeId,
            reason: null,
            metadata: null,
            createdAt: now,
          }),
        );

        return requestId;
      },
    );

    return {
      requestId: created,
      state: RequestState.SUBMITTED,
      message: 'Request submitted. Awaiting HCM confirmation.',
      estimatedResolutionSeconds: 30,
    };
  }

  async getRequestById(requestId: string): Promise<{
    requestId: string;
    employeeId: string;
    locationId: string;
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    daysRequested: number;
    state: RequestState;
    hcmExternalRef: string | null;
    rejectionReason: string | null;
    createdAt: string;
    updatedAt: string;
  }> {
    const row = await this.dataSource.getRepository(TimeOffRequest).findOneByOrFail({ id: requestId });
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

  async cancelRequest(
    requestId: string,
    employeeId: string,
  ): Promise<{ requestId: string; state: RequestState; message: string }> {
    const req = await this.dataSource.getRepository(TimeOffRequest).findOneBy({ id: requestId });
    if (!req) throw new RequestNotFoundError(`Request ${requestId} not found`);

    if (req.state === RequestState.SUBMITTED) {
      await this.balanceService.withBalanceLock(req.employeeId, req.locationId, req.leaveType, async (manager) => {
        const bal = await this.balanceRepository.lockRow(
          manager,
          req.employeeId,
          req.locationId,
          req.leaveType,
        );
        if (!bal) throw new RequestNotFoundError(`Balance missing for request ${requestId}`);

        RequestStateMachine.transition(RequestState.SUBMITTED, RequestState.CANCELLED);
        const now = new Date().toISOString();
        const oldPending = bal.pendingDays;
        const nextPending = Math.max(0, oldPending - req.daysRequested);

        await manager.getRepository(TimeOffRequest).update(
          { id: req.id },
          { state: RequestState.CANCELLED, lastOutboxEvent: null, updatedAt: now },
        );
        await manager.getRepository(Balance).update({ id: bal.id }, { pendingDays: nextPending, updatedAt: now });
        if (oldPending !== nextPending) {
          await manager.getRepository(BalanceChangeLog).insert({
            id: randomUUID(),
            balanceId: bal.id,
            employeeId: bal.employeeId,
            locationId: bal.locationId,
            leaveType: bal.leaveType,
            fieldChanged: 'pending_days',
            oldValue: oldPending,
            newValue: nextPending,
            delta: nextPending - oldPending,
            source: BalanceChangeSource.REQUEST,
            sourceRef: req.id,
            hcmTimestamp: null,
            createdAt: now,
          });
        }
        await manager.getRepository(RequestAuditLog).insert({
          id: randomUUID(),
          requestId: req.id,
          fromState: RequestState.SUBMITTED,
          toState: RequestState.CANCELLED,
          actor: employeeId,
          reason: null,
          metadata: null,
          createdAt: now,
        });
      });
      return { requestId, state: RequestState.CANCELLED, message: 'Request cancelled successfully.' };
    }

    if (req.state === RequestState.APPROVED) {
      RequestStateMachine.transition(RequestState.APPROVED, RequestState.CANCELLING);
      const now = new Date().toISOString();
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(TimeOffRequest).update(
          { id: req.id },
          {
            state: RequestState.CANCELLING,
            lastOutboxEvent: OutboxEventType.HCM_REVERSE,
            updatedAt: now,
          },
        );
        await manager.getRepository(Outbox).insert({
          id: randomUUID(),
          eventType: OutboxEventType.HCM_REVERSE,
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
        await manager.getRepository(RequestAuditLog).insert({
          id: randomUUID(),
          requestId: req.id,
          fromState: RequestState.APPROVED,
          toState: RequestState.CANCELLING,
          actor: employeeId,
          reason: 'CANCELLATION_INITIATED',
          metadata: null,
          createdAt: now,
        });
      });
      return { requestId, state: RequestState.CANCELLING, message: 'Reversal initiated.' };
    }

    throw new InvalidStateTransitionException(
      `Cannot cancel request in ${req.state} state`,
    );
  }

  private validateDto(dto: CreateTimeOffRequestDto): void {
    if (dto.daysRequested <= 0) {
      throw new BadRequestException('daysRequested must be > 0');
    }
    if (Math.abs(dto.daysRequested * 2 - Math.round(dto.daysRequested * 2)) > 0.000001) {
      throw new BadRequestException('daysRequested must be a multiple of 0.5');
    }
    if (!Object.values(LeaveType).includes(dto.leaveType)) {
      throw new BadRequestException('leaveType is invalid');
    }
    if (new Date(dto.startDate).getTime() >= new Date(dto.endDate).getTime()) {
      throw new BadRequestException('startDate must be before endDate');
    }
  }

  private computeBusinessDays(startDate: string, endDate: string): number {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    let days = 0;
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.getUTCDay();
      if (day !== 0 && day !== 6) days += 1;
    }
    return days;
  }
}

