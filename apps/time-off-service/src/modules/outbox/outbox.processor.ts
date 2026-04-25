import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import { BalanceChangeSource, OutboxEventType, RequestState } from '../../domain/enums';
import { RequestStateMachine } from '../../domain/state-machine';
import { BalanceChangeLog } from '../balance/entities/balance-change-log.entity';
import { Balance } from '../balance/entities/balance.entity';
import { HcmDeductionWriter } from '../hcm-client/hcm-deduction-writer.service';
import type { HcmResult } from '../hcm-client/types';
import { Outbox } from '../time-off/entities/outbox.entity';
import { RequestAuditLog } from '../time-off/entities/request-audit-log.entity';
import { TimeOffRequest } from '../time-off/entities/time-off-request.entity';
import { OutboxRepository } from './outbox.repository';

const MAX_OUTBOX_ATTEMPTS = 3;

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly outboxRepo: OutboxRepository,
    private readonly hcmWriter: HcmDeductionWriter,
  ) {}

  async process(record: Outbox): Promise<void> {
    const nextAttempt = record.attempts + 1;
    await this.dataSource.getRepository(Outbox).update(
      { id: record.id },
      { attempts: nextAttempt, lastAttemptedAt: new Date().toISOString(), status: 'PROCESSING' },
    );

    const current = await this.dataSource.getRepository(Outbox).findOneByOrFail({ id: record.id });

    if (current.attempts > MAX_OUTBOX_ATTEMPTS) {
      await this.markFailed(current, 'SAFETY_GUARD_EXCEEDED');
      return;
    }

    if (current.eventType === OutboxEventType.HCM_DEDUCT) {
      await this.handleDeduct(current);
      return;
    }

    await this.handleReverse(current);
  }

  private async handleDeduct(record: Outbox): Promise<void> {
    const req = await this.dataSource.getRepository(TimeOffRequest).findOneByOrFail({ id: record.requestId });
    if (req.state === RequestState.SUBMITTED) {
      RequestStateMachine.transition(RequestState.SUBMITTED, RequestState.PENDING_HCM);
      await this.dataSource.getRepository(TimeOffRequest).update(
        { id: req.id },
        { state: RequestState.PENDING_HCM, updatedAt: new Date().toISOString() },
      );
      await this.writeAudit(req.id, RequestState.SUBMITTED, RequestState.PENDING_HCM, 'SYSTEM');
      req.state = RequestState.PENDING_HCM;
    }

    const payload = JSON.parse(record.payload) as {
      externalRef: string;
      employeeId: string;
      locationId: string;
      leaveType: string;
      daysRequested: number;
      startDate: string;
      endDate: string;
    };

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
    } else {
      await this.outboxRepo.scheduleRetry(record.id, record.attempts, result.reason);
    }
  }

  private async handleReverse(record: Outbox): Promise<void> {
    const req = await this.dataSource.getRepository(TimeOffRequest).findOneByOrFail({ id: record.requestId });
    const payload = JSON.parse(record.payload) as {
      externalRef: string;
      hcmTransactionId: string;
      employeeId: string;
      locationId: string;
      leaveType: string;
      days: number;
    };

    const result = await this.hcmWriter.reverse(payload);
    if (result.success || (result.reason === 'CLIENT_ERROR' && result.statusCode === 409)) {
      const bal = await this.dataSource.getRepository(Balance).findOneByOrFail({
        employeeId: req.employeeId,
        locationId: req.locationId,
        leaveType: req.leaveType,
      });
      const oldUsed = bal.usedDays;
      const newUsed = Number((result.success ? result.data : (result as any).body)?.newUsedDays ?? Math.max(0, oldUsed - req.daysRequested));
      await this.dataSource.getRepository(Balance).update(
        { id: bal.id },
        {
          usedDays: newUsed,
          hcmLastUpdatedAt: (result.success ? result.data : (result as any).body)?.lastUpdatedAt ?? bal.hcmLastUpdatedAt,
          syncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      );
      await this.writeBalanceChange(
        bal,
        'used_days',
        oldUsed,
        newUsed,
        req.id,
        (result.success ? result.data : (result as any).body)?.lastUpdatedAt ?? null,
      );
      RequestStateMachine.transition(req.state, RequestState.CANCELLED);
      await this.dataSource.getRepository(TimeOffRequest).update(
        { id: req.id },
        { state: RequestState.CANCELLED, lastOutboxEvent: null, updatedAt: new Date().toISOString() },
      );
      await this.outboxRepo.markDone(record.id);
      await this.writeAudit(req.id, req.state, RequestState.CANCELLED, 'HCM_RESPONSE');
      return;
    }

    if (result.reason === 'CLIENT_ERROR') {
      await this.markFailed(record, 'REVERSAL_REJECTED');
      return;
    }
    if (record.attempts >= MAX_OUTBOX_ATTEMPTS) {
      await this.markFailed(record, result.reason);
    } else {
      await this.outboxRepo.scheduleRetry(record.id, record.attempts, result.reason);
    }
  }

  private async handleApprove(record: Outbox, req: TimeOffRequest, result: HcmResult<any>): Promise<void> {
    const bal = await this.dataSource.getRepository(Balance).findOneByOrFail({
      employeeId: req.employeeId,
      locationId: req.locationId,
      leaveType: req.leaveType,
    });
    const data = result.success ? result.data : (result as any).body;
    const newUsed = Number((data as any)?.newUsedDays ?? bal.usedDays + req.daysRequested);
    const oldUsed = bal.usedDays;
    const oldPending = bal.pendingDays;
    const now = new Date().toISOString();

    await this.dataSource.getRepository(Balance).update(
      { id: bal.id },
      {
        usedDays: newUsed,
        pendingDays: Math.max(0, bal.pendingDays - req.daysRequested),
        hcmLastUpdatedAt: (data as any)?.lastUpdatedAt ?? bal.hcmLastUpdatedAt,
        syncedAt: now,
        updatedAt: now,
      },
    );
    await this.writeBalanceChange(bal, 'used_days', oldUsed, newUsed, req.id, (data as any)?.lastUpdatedAt ?? null);
    await this.writeBalanceChange(
      bal,
      'pending_days',
      oldPending,
      Math.max(0, oldPending - req.daysRequested),
      req.id,
      (data as any)?.lastUpdatedAt ?? null,
    );

    RequestStateMachine.transition(req.state, RequestState.APPROVED);
    await this.dataSource.getRepository(TimeOffRequest).update(
      { id: req.id },
      {
        state: RequestState.APPROVED,
        lastOutboxEvent: null,
        hcmResponseCode: (result as any).statusCode ?? 200,
        hcmResponseBody: JSON.stringify((result as any).data ?? (result as any).body ?? null),
        updatedAt: now,
      },
    );
    await this.outboxRepo.markDone(record.id);
    await this.writeAudit(req.id, req.state, RequestState.APPROVED, 'HCM_RESPONSE');
  }

  private async handleReject(record: Outbox, req: TimeOffRequest, result: HcmResult<any>): Promise<void> {
    const bal = await this.dataSource.getRepository(Balance).findOneByOrFail({
      employeeId: req.employeeId,
      locationId: req.locationId,
      leaveType: req.leaveType,
    });
    const oldPending = bal.pendingDays;
    const nextPending = Math.max(0, oldPending - req.daysRequested);
    await this.dataSource
      .getRepository(Balance)
      .update({ id: bal.id }, { pendingDays: nextPending, updatedAt: new Date().toISOString() });
    await this.writeBalanceChange(bal, 'pending_days', oldPending, nextPending, req.id, null);

    RequestStateMachine.transition(req.state, RequestState.REJECTED);
    await this.dataSource.getRepository(TimeOffRequest).update(
      { id: req.id },
      {
        state: RequestState.REJECTED,
        lastOutboxEvent: null,
        hcmResponseCode: result.statusCode ?? 400,
        hcmResponseBody: JSON.stringify(('body' in result ? result.body : null) ?? null),
        rejectionReason:
          ((('body' in result ? result.body : null) as any)?.message as string | undefined) ??
          'HCM rejected request',
        updatedAt: new Date().toISOString(),
      },
    );
    await this.outboxRepo.markDone(record.id);
    await this.writeAudit(req.id, req.state, RequestState.REJECTED, 'HCM_RESPONSE');
  }

  private async markFailed(record: Outbox, reason: string): Promise<void> {
    const req = await this.dataSource.getRepository(TimeOffRequest).findOneByOrFail({ id: record.requestId });
    const bal = await this.dataSource.getRepository(Balance).findOneByOrFail({
      employeeId: req.employeeId,
      locationId: req.locationId,
      leaveType: req.leaveType,
    });
    const oldPending = bal.pendingDays;
    const nextPending = Math.max(0, oldPending - req.daysRequested);
    await this.dataSource
      .getRepository(Balance)
      .update({ id: bal.id }, { pendingDays: nextPending, updatedAt: new Date().toISOString() });
    await this.writeBalanceChange(bal, 'pending_days', oldPending, nextPending, req.id, null);

    RequestStateMachine.transition(req.state, RequestState.FAILED);
    await this.dataSource.getRepository(TimeOffRequest).update(
      { id: req.id },
      {
        state: RequestState.FAILED,
        failureReason: record.eventType === OutboxEventType.HCM_DEDUCT ? 'DEDUCTION_FAILED' : 'REVERSAL_FAILED',
        lastOutboxEvent: null,
        updatedAt: new Date().toISOString(),
      },
    );
    await this.outboxRepo.markFailed(record.id, reason);
    await this.writeAudit(req.id, req.state, RequestState.FAILED, 'SYSTEM', 'OUTBOX_EXHAUSTED');
    this.logger.error({ outboxId: record.id, requestId: req.id, eventType: record.eventType, result: reason });
  }

  private async writeAudit(
    requestId: string,
    fromState: RequestState | null,
    toState: RequestState,
    actor: string,
    reason: string | null = null,
  ): Promise<void> {
    await this.dataSource.getRepository(RequestAuditLog).insert({
      id: randomUUID(),
      requestId,
      fromState,
      toState,
      actor,
      reason,
      metadata: null,
      createdAt: new Date().toISOString(),
    });
  }

  private async writeBalanceChange(
    bal: Balance,
    fieldChanged: 'used_days' | 'pending_days' | 'total_days',
    oldValue: number,
    newValue: number,
    sourceRef: string,
    hcmTs: string | null,
  ): Promise<void> {
    if (oldValue === newValue) return;
    await this.dataSource.getRepository(BalanceChangeLog).insert({
      id: randomUUID(),
      balanceId: bal.id,
      employeeId: bal.employeeId,
      locationId: bal.locationId,
      leaveType: bal.leaveType,
      fieldChanged,
      oldValue,
      newValue,
      delta: newValue - oldValue,
      source: BalanceChangeSource.REQUEST,
      sourceRef,
      hcmTimestamp: hcmTs,
      createdAt: new Date().toISOString(),
    });
  }
}

