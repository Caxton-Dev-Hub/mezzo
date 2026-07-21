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
import { Currency } from '../../common/money/currency';
import { PayoutStatus } from '../../payments/entities/payout-status.enum';

const bigintTransformer = { to: (value: number) => value, from: (value: string) => Number(value) };

@Entity('payouts')
export class Payout {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'seller_id', type: 'uuid' })
  sellerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_id' })
  seller!: User;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: Currency;

  @Column({ name: 'bank_account_number', type: 'varchar', length: 32 })
  bankAccountNumber!: string;

  @Column({ name: 'bank_code', type: 'varchar', length: 32 })
  bankCode!: string;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Index({ unique: true })
  @Column({ name: 'provider_reference', type: 'varchar', length: 128 })
  providerReference!: string;

  @Index({ unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey!: string;

  @Column({ type: 'enum', enum: PayoutStatus, default: PayoutStatus.PENDING })
  status!: PayoutStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
