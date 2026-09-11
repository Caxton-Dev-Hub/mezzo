import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StellarNetworkName } from '@mezzo/shared-types';
import { Escrow } from './escrow.entity';
import { Currency } from '../../common/money/currency';
import { StellarEscrowStatus } from '../../stellar/entities/stellar-escrow-status.enum';

@Entity('stellar_escrows')
export class StellarEscrow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'escrow_id', type: 'uuid', unique: true })
  escrowId!: string;

  @OneToOne(() => Escrow, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escrow_id' })
  escrow!: Escrow;

  @Column({ name: 'network', type: 'varchar', length: 16 })
  network!: StellarNetworkName;

  @Column({ name: 'deposit_account_id', type: 'varchar', length: 56 })
  depositAccountId!: string;

  @Column({ name: 'memo', type: 'varchar', length: 28 })
  memo!: string;

  @Column({ name: 'asset_code', type: 'varchar', length: 12 })
  assetCode!: string;

  @Column({ name: 'asset_issuer', type: 'varchar', length: 56 })
  assetIssuer!: string;

  @Column({
    name: 'expected_amount',
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  expectedAmount!: number;

  @Column({ name: 'expected_currency', type: 'varchar', length: 8 })
  expectedCurrency!: Currency;

  @Column({ name: 'status', type: 'varchar', length: 24, default: StellarEscrowStatus.AWAITING_DEPOSIT })
  status!: StellarEscrowStatus;

  @Index({ unique: true, where: 'funding_transaction_hash IS NOT NULL' })
  @Column({ name: 'funding_transaction_hash', type: 'varchar', length: 64, nullable: true })
  fundingTransactionHash!: string | null;

  @Column({ name: 'settlement_transaction_hash', type: 'varchar', length: 64, nullable: true })
  settlementTransactionHash!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
