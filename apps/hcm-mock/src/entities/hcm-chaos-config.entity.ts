import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'hcm_chaos_config' })
export class HcmChaosConfig {
  @PrimaryColumn({ type: 'text' })
  id!: 'singleton';

  @Column({ type: 'text', default: '{}' })
  config!: string;
}

