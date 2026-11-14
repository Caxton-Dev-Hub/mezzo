import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('staff_assignments')
@Index(['userId', 'shopId'], { unique: true })
export class StaffAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
