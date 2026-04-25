import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type HcmTransactionType = 'DEDUCT' | 'REVERSE';
export type HcmTransactionStatus = 'APPLIED' | 'REVERSED' | 'SILENT_FAILED';

@Entity({ name: 'hcm_transaction' })
@Index('idx_hcm_txn_ext_ref', ['externalRef'])
@Index('idx_hcm_txn_employee', ['employeeId'])
export class HcmTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'external_ref', type: 'text', unique: true })
  externalRef!: string;

  @Column({ name: 'employee_id', type: 'text' })
  employeeId!: string;

  @Column({ name: 'location_id', type: 'text' })
  locationId!: string;

  @Column({ name: 'leave_type', type: 'text' })
  leaveType!: string;

  @Column({ name: 'transaction_type', type: 'text' })
  transactionType!: HcmTransactionType;

  @Column({ name: 'days', type: 'real' })
  days!: number;

  @Column({ name: 'start_date', type: 'text', nullable: true })
  startDate!: string | null;

  @Column({ name: 'end_date', type: 'text', nullable: true })
  endDate!: string | null;

  @Column({ name: 'status', type: 'text' })
  status!: HcmTransactionStatus;

  @Column({ name: 'reversed_by', type: 'text', nullable: true })
  reversedBy!: string | null;

  @Column({ name: 'created_at', type: 'text' })
  createdAt!: string;
}

