import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum RentalChargeType {
  BASE = 'BASE',
  OVERAGE = 'OVERAGE',
  REPLACEMENT = 'REPLACEMENT',
}

@Entity('rental_charges')
export class RentalCharge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'rental_id', type: 'uuid' })
  rentalId!: string;

  @Column({ name: 'charge_type', type: 'enum', enum: RentalChargeType })
  chargeType!: RentalChargeType;

  @Column({ type: 'bigint' })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ name: 'charged_at', type: 'timestamptz' })
  chargedAt!: Date;

  @Column({ name: 'ledger_posting_id', type: 'uuid', nullable: true })
  ledgerPostingId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;
}
