import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum RentalStatus {
  ACTIVE = 'ACTIVE',
  RETURNED = 'RETURNED',
  OVERDUE = 'OVERDUE',
  UNRETURNED = 'UNRETURNED',
}

@Entity('rentals')
export class Rental {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'powerbank_id', type: 'uuid' })
  powerbankId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId!: string;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'due_at', type: 'timestamptz' })
  dueAt!: Date;

  @Column({ name: 'returned_at', type: 'timestamptz', nullable: true })
  returnedAt!: Date | null;

  @Column({ type: 'enum', enum: RentalStatus })
  status!: RentalStatus;

  @Column({ name: 'base_charge_amount', type: 'bigint' })
  baseChargeAmount!: string;

  @Column({ name: 'base_charge_currency', type: 'varchar', length: 3 })
  baseChargeCurrency!: string;

  @Column({ name: 'total_charged_amount', type: 'bigint' })
  totalChargedAmount!: string;

  @Column({ name: 'total_charged_currency', type: 'varchar', length: 3 })
  totalChargedCurrency!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
