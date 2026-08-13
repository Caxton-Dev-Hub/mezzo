import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('platform_flags')
export class PlatformFlag {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: string;

  @Column({ type: 'boolean' })
  enabled!: boolean;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById!: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
