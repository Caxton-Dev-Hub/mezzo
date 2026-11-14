import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('accessory_sales')
export class AccessorySale {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'accessory_id', type: 'uuid' })
  accessoryId!: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId!: string;

  @Column({ name: 'sold_by', type: 'uuid' })
  soldBy!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'total_amount', type: 'bigint' })
  totalAmount!: string;

  @Column({ name: 'total_currency', type: 'varchar', length: 3 })
  totalCurrency!: string;

  @Column({ name: 'sold_at', type: 'timestamptz' })
  soldAt!: Date;
}
