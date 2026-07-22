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
import { User } from './user.entity';
import { EvidenceItem } from './evidence-item.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'escrow_id', type: 'uuid' })
  escrowId!: string;

  @ManyToOne(() => Escrow, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escrow_id' })
  escrow!: Escrow;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender!: User;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'attachment_evidence_item_id', type: 'uuid', nullable: true })
  attachmentEvidenceItemId!: string | null;

  @ManyToOne(() => EvidenceItem, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'attachment_evidence_item_id' })
  attachmentEvidenceItem!: EvidenceItem | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
