import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StellarNetworkName } from '@mezzo/shared-types';

@Entity('stellar_accounts')
@Index(['userId', 'network'], { unique: true })
export class StellarAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'network', type: 'varchar', length: 16 })
  network!: StellarNetworkName;

  @Column({ name: 'account_id', type: 'varchar', length: 56 })
  accountId!: string;

  @Column({ name: 'linked_at', type: 'timestamptz' })
  linkedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
