import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PowerbankStatus {
  AVAILABLE = 'AVAILABLE',
  RENTED = 'RENTED',
  OVERDUE = 'OVERDUE',
  UNRETURNED = 'UNRETURNED',
  LOST = 'LOST',
  MAINTENANCE = 'MAINTENANCE',
}

@Entity('powerbanks')
@Index(['shopId', 'number'], { unique: true })
export class Powerbank {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId!: string;

  @Column({ type: 'varchar', length: 50 })
  number!: string;

  @Column({ type: 'enum', enum: PowerbankStatus })
  status!: PowerbankStatus;

  @Column({ name: 'replacement_price_amount', type: 'bigint' })
  replacementPriceAmount!: string;

  @Column({ name: 'replacement_price_currency', type: 'varchar', length: 3 })
  replacementPriceCurrency!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
