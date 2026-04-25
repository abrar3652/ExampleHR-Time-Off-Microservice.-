import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'idempotency_record' })
@Index('idx_ir_expires', ['expiresAt'])
export class IdempotencyRecord {
  @PrimaryColumn({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string;

  @Column({ type: 'text', default: 'IN_PROGRESS' })
  status!: 'IN_PROGRESS' | 'COMPLETE';

  @Column({ name: 'response_status', type: 'integer', nullable: true })
  responseStatus!: number | null;

  @Column({ name: 'response_body', type: 'text', nullable: true })
  responseBody!: string | null;

  @Column({ name: 'request_body', type: 'text', nullable: true })
  requestBody!: string | null;

  @Column({ name: 'expires_at', type: 'text' })
  expiresAt!: string;

  @Column({ name: 'created_at', type: 'text' })
  createdAt!: string;
}

