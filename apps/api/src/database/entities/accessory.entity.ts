import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('accessories')
export class Accessory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'price_amount', type: 'bigint' })
  priceAmount!: string;

  @Column({ name: 'price_currency', type: 'varchar', length: 3 })
  priceCurrency!: string;

  @Column({ name: 'stock_level', type: 'int' })
  stockLevel!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
