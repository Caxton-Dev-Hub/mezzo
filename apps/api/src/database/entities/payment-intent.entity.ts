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
import { Escrow } from './escrow.entity';
import { User } from './user.entity';
import { Currency } from '../../common/money/currency';
import { PaymentIntentStatus } from '../../payments/entities/payment-intent-status.enum';

const bigintTransformer = { to: (value: number) => value, from: (value: string) => Number(value) };

@Entity('payment_intents')
export class PaymentIntent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'escrow_id', type: 'uuid' })
  escrowId!: string;

  @ManyToOne(() => Escrow, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escrow_id' })
  escrow!: Escrow;

  @Column({ name: 'buyer_id', type: 'uuid' })
  buyerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'buyer_id' })
  buyer!: User;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: Currency;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Index({ unique: true })
  @Column({ name: 'provider_reference', type: 'varchar', length: 128 })
  providerReference!: string;

  @Column({ type: 'enum', enum: PaymentIntentStatus, default: PaymentIntentStatus.PENDING })
  status!: PaymentIntentStatus;

  @Column({ name: 'authorization_url', type: 'text', nullable: true })
  authorizationUrl!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
