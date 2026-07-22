import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Dispute } from './dispute.entity';
import { DisputeResolutionOutcome } from '../../disputes/entities/dispute-resolution-outcome.enum';
import { ArbitrationStatus } from '../../arbitration/entities/arbitration-status.enum';
import { AbstentionReason } from '../../arbitration/entities/abstention-reason.enum';

@Entity('arbitration_records')
export class ArbitrationRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'dispute_id', type: 'uuid' })
  disputeId!: string;

  @ManyToOne(() => Dispute, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_id' })
  dispute!: Dispute;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ type: 'enum', enum: ArbitrationStatus })
  status!: ArbitrationStatus;

  @Column({ name: 'outcome', type: 'enum', enum: DisputeResolutionOutcome, nullable: true })
  outcome!: DisputeResolutionOutcome | null;

  @Column({ name: 'split_seller_bps', type: 'int', nullable: true })
  splitSellerBps!: number | null;

  @Column({ type: 'real', default: 0 })
  confidence!: number;

  @Column({ type: 'text', default: '' })
  rationale!: string;

  @Column({ name: 'cited_evidence_ids', type: 'jsonb', default: () => "'[]'" })
  citedEvidenceIds!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  contradictions!: string[];

  @Column({ name: 'missing_evidence', type: 'jsonb', default: () => "'[]'" })
  missingEvidence!: string[];

  @Column({ name: 'abstention_reason', type: 'enum', enum: AbstentionReason, nullable: true })
  abstentionReason!: AbstentionReason | null;

  @Column({ name: 'raw_response', type: 'text' })
  rawResponse!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
