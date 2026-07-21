import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Escrow } from './escrow.entity';
import { Currency } from '../../common/money/currency';
import { DisputeState } from '../../disputes/entities/dispute-state.enum';
import { DisputeReasonCode } from '../../disputes/entities/dispute-reason-code.enum';
import { DisputeResolutionOutcome } from '../../disputes/entities/dispute-resolution-outcome.enum';

const bigintTransformer = { to: (value: number) => value, from: (value: string) => Number(value) };

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'escrow_id', type: 'uuid', unique: true })
  escrowId!: string;

  @OneToOne(() => Escrow, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escrow_id' })
  escrow!: Escrow;

  @Column({ name: 'raised_by_user_id', type: 'uuid' })
  raisedByUserId!: string;

  @Column({ name: 'reason_code', type: 'enum', enum: DisputeReasonCode })
  reasonCode!: DisputeReasonCode;

  @Column({ type: 'text' })
  statement!: string;

  @Column({ type: 'enum', enum: DisputeState, default: DisputeState.OPEN })
  state!: DisputeState;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'evidence_window_expires_at', type: 'timestamptz' })
  evidenceWindowExpiresAt!: Date;

  @Column({ name: 'resolved_outcome', type: 'enum', enum: DisputeResolutionOutcome, nullable: true })
  resolvedOutcome!: DisputeResolutionOutcome | null;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true })
  resolvedByUserId!: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'resolved_seller_amount', type: 'bigint', nullable: true, transformer: bigintTransformer })
  resolvedSellerAmount!: number | null;

  @Column({ name: 'resolved_buyer_amount', type: 'bigint', nullable: true, transformer: bigintTransformer })
  resolvedBuyerAmount!: number | null;

  @Column({ name: 'resolved_fee_amount', type: 'bigint', nullable: true, transformer: bigintTransformer })
  resolvedFeeAmount!: number | null;

  @Column({ name: 'resolved_currency', type: 'varchar', length: 8, nullable: true })
  resolvedCurrency!: Currency | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
