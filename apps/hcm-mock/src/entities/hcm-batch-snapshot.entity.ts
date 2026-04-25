import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'hcm_batch_snapshot' })
export class HcmBatchSnapshot {
  @PrimaryColumn({ name: 'batch_id', type: 'text' })
  batchId!: string;

  @PrimaryColumn({ name: 'record_index', type: 'integer' })
  recordIndex!: number;

  @Column({ name: 'record_data', type: 'text' })
  recordData!: string;

  @Column({ name: 'generated_at', type: 'text' })
  generatedAt!: string;

  @Column({ name: 'expires_at', type: 'text' })
  expiresAt!: string;
}

