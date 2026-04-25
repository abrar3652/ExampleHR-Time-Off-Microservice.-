import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

import { OutboxEventType } from '../../../domain/enums';

@Entity({ name: 'outbox' })
@Index('idx_outbox_pending', ['status', 'processAfter'])
export class Outbox {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'event_type', type: 'text' })
  eventType!: OutboxEventType;

  @Column({ type: 'text' })
  payload!: string;

  @Column({ name: 'request_id', type: 'text' })
  requestId!: string;

  @Column({ type: 'text', default: 'PENDING' })
  status!: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'last_attempted_at', type: 'text', nullable: true })
  lastAttemptedAt!: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'created_at', type: 'text' })
  createdAt!: string;

  @Column({ name: 'process_after', type: 'text' })
  processAfter!: string;
}

