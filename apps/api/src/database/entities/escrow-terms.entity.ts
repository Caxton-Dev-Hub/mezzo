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

@Entity('escrow_terms')
export class EscrowTerms {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'escrow_id', type: 'uuid', unique: true })
  escrowId!: string;

  @OneToOne(() => Escrow, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escrow_id' })
  escrow!: Escrow;

  @Column({ name: 'price_amount', type: 'bigint', transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  priceAmount!: number;

  @Column({ name: 'price_currency', type: 'varchar', length: 8 })
  priceCurrency!: Currency;

  @Column({ name: 'inspection_window_hours', type: 'int' })
  inspectionWindowHours!: number;

  @Column({ name: 'delivery_method', type: 'varchar', length: 255 })
  deliveryMethod!: string;

  @Column({ name: 'item_description', type: 'text' })
  itemDescription!: string;

  @Column({ name: 'fee_bps', type: 'int' })
  feeBps!: number;

  @Column({ name: 'requires_verification', type: 'boolean', default: false })
  requiresVerification!: boolean;

  @Column({ name: 'agreement_text', type: 'text', nullable: true })
  agreementText!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
