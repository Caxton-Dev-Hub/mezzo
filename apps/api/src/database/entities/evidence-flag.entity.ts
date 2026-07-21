import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EvidenceItem } from './evidence-item.entity';
import { EvidenceFlagType } from '../../evidence/entities/evidence-flag-type.enum';

@Entity('evidence_flags')
export class EvidenceFlag {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'evidence_item_id', type: 'uuid' })
  evidenceItemId!: string;

  @ManyToOne(() => EvidenceItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evidence_item_id' })
  evidenceItem!: EvidenceItem;

  @Column({ type: 'enum', enum: EvidenceFlagType })
  type!: EvidenceFlagType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
