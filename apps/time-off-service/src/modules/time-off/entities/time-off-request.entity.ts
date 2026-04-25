import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

import { LeaveType, OutboxEventType, RequestState } from '../../../domain/enums';

@Entity({ name: 'time_off_request' })
@Index('idx_tor_employee', ['employeeId'])
@Index('idx_tor_state', ['state'])
@Index('idx_tor_idempotency', ['idempotencyKey'])
export class TimeOffRequest {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'idempotency_key', type: 'text', unique: true })
  idempotencyKey!: string;

  @Column({ name: 'employee_id', type: 'text' })
  employeeId!: string;

  @Column({ name: 'location_id', type: 'text' })
  locationId!: string;

  @Column({ name: 'leave_type', type: 'text' })
  leaveType!: LeaveType;

  @Column({ name: 'start_date', type: 'text' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'text' })
  endDate!: string;

  @Column({ name: 'days_requested', type: 'real' })
  daysRequested!: number;

  @Column({ type: 'text' })
  state!: RequestState;

  @Column({ name: 'last_outbox_event', type: 'text', nullable: true })
  lastOutboxEvent!: OutboxEventType | null;

  @Column({ name: 'hcm_external_ref', type: 'text', nullable: true })
  hcmExternalRef!: string | null;

  @Column({ name: 'hcm_transaction_id', type: 'text', nullable: true })
  hcmTransactionId!: string | null;

  @Column({ name: 'hcm_response_code', type: 'integer', nullable: true })
  hcmResponseCode!: number | null;

  @Column({ name: 'hcm_response_body', type: 'text', nullable: true })
  hcmResponseBody!: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount!: number;

  @Column({ name: 'created_by', type: 'text' })
  createdBy!: string;

  @Column({ name: 'approved_by', type: 'text', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'created_at', type: 'text' })
  createdAt!: string;

  @Column({ name: 'updated_at', type: 'text' })
  updatedAt!: string;
}

