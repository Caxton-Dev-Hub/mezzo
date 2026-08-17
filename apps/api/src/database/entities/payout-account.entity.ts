import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('payout_accounts')
export class PayoutAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'bank_code', type: 'varchar', length: 32 })
  bankCode!: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 128 })
  bankName!: string;

  @Column({ name: 'account_number', type: 'varchar', length: 32 })
  accountNumber!: string;

  @Column({ name: 'account_name', type: 'varchar', length: 128 })
  accountName!: string;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
