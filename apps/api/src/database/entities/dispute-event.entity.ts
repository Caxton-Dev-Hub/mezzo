import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Dispute } from './dispute.entity';
import { DisputeState } from '../../disputes/entities/dispute-state.enum';

@Entity('dispute_events')
export class DisputeEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'dispute_id', type: 'uuid' })
  disputeId!: string;

  @ManyToOne(() => Dispute, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_id' })
  dispute!: Dispute;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'from_state', type: 'enum', enum: DisputeState })
  fromState!: DisputeState;

  @Column({ name: 'to_state', type: 'enum', enum: DisputeState })
  toState!: DisputeState;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
