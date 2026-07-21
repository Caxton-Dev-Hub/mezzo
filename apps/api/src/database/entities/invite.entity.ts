import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Escrow } from './escrow.entity';

@Entity('invites')
export class Invite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'escrow_id', type: 'uuid' })
  escrowId!: string;

  @ManyToOne(() => Escrow, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escrow_id' })
  escrow!: Escrow;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  token!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'used_by_user_id', type: 'uuid', nullable: true })
  usedByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
