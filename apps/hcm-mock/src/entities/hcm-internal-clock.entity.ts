import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'hcm_internal_clock' })
export class HcmInternalClock {
  @PrimaryColumn({ type: 'text' })
  id!: 'singleton';

  @Column({ name: 'offset_ms', type: 'integer', default: 0 })
  offsetMs!: number;
}

