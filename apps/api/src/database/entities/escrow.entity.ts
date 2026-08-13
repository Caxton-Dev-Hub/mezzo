import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EscrowState } from '../../escrow/entities/escrow-state.enum';

@Entity('escrows')
export class Escrow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  code!: string;

  @Column({ type: 'enum', enum: EscrowState, default: EscrowState.DRAFT })
  state!: EscrowState;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'tracking_reference', type: 'varchar', length: 255, nullable: true })
  trackingReference!: string | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
