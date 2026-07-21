import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KycVerification } from './kyc-verification.entity';
import { KycTier } from '../../kyc/entities/kyc-tier.enum';
import { KycEventType } from '../../kyc/entities/kyc-event-type.enum';

@Entity('kyc_events')
export class KycEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'verification_id', type: 'uuid' })
  verificationId!: string;

  @ManyToOne(() => KycVerification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'verification_id' })
  verification!: KycVerification;

  @Column({ type: 'enum', enum: KycEventType })
  type!: KycEventType;

  @Column({ name: 'previous_tier', type: 'enum', enum: KycTier })
  previousTier!: KycTier;

  @Column({ name: 'new_tier', type: 'enum', enum: KycTier, nullable: true })
  newTier!: KycTier | null;

  @Column({ name: 'provider_reference', type: 'varchar', length: 128 })
  providerReference!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
