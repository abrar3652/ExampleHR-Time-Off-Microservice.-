import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'reconciliation_log' })
export class ReconciliationLog {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'run_id', type: 'text' })
  runId!: string;

  @Column({ name: 'employee_id', type: 'text' })
  employeeId!: string;

  @Column({ name: 'location_id', type: 'text' })
  locationId!: string;

  @Column({ name: 'leave_type', type: 'text' })
  leaveType!: string;

  @Column({ name: 'drift_field', type: 'text' })
  driftField!: string;

  @Column({ name: 'local_value', type: 'real' })
  localValue!: number;

  @Column({ name: 'hcm_value', type: 'real' })
  hcmValue!: number;

  @Column({ name: 'adjusted_local', type: 'real' })
  adjustedLocal!: number;

  @Column({ type: 'real' })
  drift!: number;

  @Column({ type: 'integer', default: 0 })
  resolved!: number;

  @Column({ type: 'text', nullable: true })
  resolution!: string | null;

  @Column({ name: 'resolved_at', type: 'text', nullable: true })
  resolvedAt!: string | null;

  @Column({ name: 'created_at', type: 'text' })
  createdAt!: string;
}

