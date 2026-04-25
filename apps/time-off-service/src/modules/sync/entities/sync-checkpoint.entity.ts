import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'sync_checkpoint' })
export class SyncCheckpoint {
  @PrimaryColumn({ type: 'text', default: 'singleton' })
  id!: string;

  @Column({ name: 'last_batch_id', type: 'text', nullable: true })
  lastBatchId!: string | null;

  @Column({ name: 'last_batch_at', type: 'text', nullable: true })
  lastBatchAt!: string | null;

  @Column({ name: 'last_record_count', type: 'integer', nullable: true })
  lastRecordCount!: number | null;

  @Column({ name: 'updated_at', type: 'text' })
  updatedAt!: string;
}

