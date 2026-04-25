import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

import { BalanceChangeSource, LeaveType } from '../../../domain/enums';

@Entity({ name: 'balance_change_log' })
@Index('idx_bcl_balance', ['balanceId'])
@Index('idx_bcl_employee', ['employeeId'])
export class BalanceChangeLog {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'balance_id', type: 'text' })
  balanceId!: string;

  @Column({ name: 'employee_id', type: 'text' })
  employeeId!: string;

  @Column({ name: 'location_id', type: 'text' })
  locationId!: string;

  @Column({ name: 'leave_type', type: 'text' })
  leaveType!: LeaveType;

  @Column({ name: 'field_changed', type: 'text' })
  fieldChanged!: 'used_days' | 'pending_days' | 'total_days';

  @Column({ name: 'old_value', type: 'real' })
  oldValue!: number;

  @Column({ name: 'new_value', type: 'real' })
  newValue!: number;

  @Column({ name: 'delta', type: 'real' })
  delta!: number;

  @Column({ name: 'source', type: 'text' })
  source!: BalanceChangeSource;

  @Column({ name: 'source_ref', type: 'text', nullable: true })
  sourceRef!: string | null;

  @Column({ name: 'hcm_timestamp', type: 'text', nullable: true })
  hcmTimestamp!: string | null;

  @Column({ name: 'created_at', type: 'text' })
  createdAt!: string;
}

