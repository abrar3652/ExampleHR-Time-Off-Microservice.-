import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'hcm_balance' })
@Unique(['employeeId', 'locationId', 'leaveType'])
@Index('idx_hcm_balance_employee', ['employeeId'])
export class HcmBalance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'employee_id', type: 'text' })
  employeeId!: string;

  @Column({ name: 'location_id', type: 'text' })
  locationId!: string;

  @Column({ name: 'leave_type', type: 'text' })
  leaveType!: string;

  @Column({ name: 'total_days', type: 'real' })
  totalDays!: number;

  @Column({ name: 'used_days', type: 'real', default: 0 })
  usedDays!: number;

  @Column({ name: 'last_updated_at', type: 'text' })
  lastUpdatedAt!: string;

  @Column({ name: 'created_at', type: 'text' })
  createdAt!: string;
}

