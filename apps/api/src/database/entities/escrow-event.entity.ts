import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Escrow } from './escrow.entity';
import { EscrowState } from '../../escrow/entities/escrow-state.enum';

@Entity('escrow_events')
export class EscrowEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'escrow_id', type: 'uuid' })
  escrowId!: string;

  @ManyToOne(() => Escrow, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escrow_id' })
  escrow!: Escrow;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'from_state', type: 'enum', enum: EscrowState })
  fromState!: EscrowState;

  @Column({ name: 'to_state', type: 'enum', enum: EscrowState })
  toState!: EscrowState;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
