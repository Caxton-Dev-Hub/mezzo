import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum OutstandingBalanceReason {
  RENTAL_OVERAGE = 'RENTAL_OVERAGE',
  REPLACEMENT_CHARGE = 'REPLACEMENT_CHARGE',
}

@Entity('outstanding_balances')
export class OutstandingBalance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'bigint' })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'enum', enum: OutstandingBalanceReason })
  reason!: OutstandingBalanceReason;

  @Column({ name: 'rental_id', type: 'uuid', nullable: true })
  rentalId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'cleared_at', type: 'timestamptz', nullable: true })
  clearedAt!: Date | null;
}
