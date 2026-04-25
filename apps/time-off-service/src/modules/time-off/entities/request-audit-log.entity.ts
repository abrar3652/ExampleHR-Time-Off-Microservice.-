import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

import { RequestState } from '../../../domain/enums';

@Entity({ name: 'request_audit_log' })
@Index('idx_ral_request', ['requestId'])
export class RequestAuditLog {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'request_id', type: 'text' })
  requestId!: string;

  @Column({ name: 'from_state', type: 'text', nullable: true })
  fromState!: RequestState | null;

  @Column({ name: 'to_state', type: 'text' })
  toState!: RequestState;

  @Column({ type: 'text' })
  actor!: string;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'text', nullable: true })
  metadata!: string | null;

  @Column({ name: 'created_at', type: 'text' })
  createdAt!: string;
}

