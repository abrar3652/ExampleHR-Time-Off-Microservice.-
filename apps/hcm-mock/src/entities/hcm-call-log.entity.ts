import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'hcm_call_log' })
export class HcmCallLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  endpoint!: string;

  @Column({ type: 'text' })
  method!: string;

  @Column({ name: 'request_body', type: 'text', nullable: true })
  requestBody!: string | null;

  @Column({ name: 'response_status', type: 'integer' })
  responseStatus!: number;

  @Column({ name: 'response_body', type: 'text', nullable: true })
  responseBody!: string | null;

  @Column({ name: 'chaos_applied', type: 'text', nullable: true })
  chaosApplied!: string | null;

  @Column({ name: 'duration_ms', type: 'integer' })
  durationMs!: number;

  @Column({ name: 'called_at', type: 'text' })
  calledAt!: string;
}

