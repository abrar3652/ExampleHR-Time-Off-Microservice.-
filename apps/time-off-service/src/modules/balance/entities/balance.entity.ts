import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import { LeaveType } from '../../../domain/enums';

@Entity({ name: 'balance' })
@Unique(['employeeId', 'locationId', 'leaveType'])
@Index('idx_balance_employee', ['employeeId'])
export class Balance {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'employee_id', type: 'text' })
  employeeId!: string;

  @Column({ name: 'location_id', type: 'text' })
  locationId!: string;

  @Column({ name: 'leave_type', type: 'text' })
  leaveType!: LeaveType;

  @Column({ name: 'total_days', type: 'real' })
  totalDays!: number;

  @Column({ name: 'used_days', type: 'real', default: 0 })
  usedDays!: number;

  @Column({ name: 'pending_days', type: 'real', default: 0 })
  pendingDays!: number;

  @Column({ name: 'hcm_last_updated_at', type: 'text' })
  hcmLastUpdatedAt!: string;

  @Column({ name: 'synced_at', type: 'text' })
  syncedAt!: string;

  @Column({ name: 'created_at', type: 'text' })
  createdAt!: string;

  @Column({ name: 'updated_at', type: 'text' })
  updatedAt!: string;
}

