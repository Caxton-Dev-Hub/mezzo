import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { KycTier } from '../../kyc/entities/kyc-tier.enum';
import { KycVerificationStatus } from '../../kyc/entities/kyc-verification-status.enum';

@Entity('kyc_verifications')
export class KycVerification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'requested_tier', type: 'enum', enum: KycTier })
  requestedTier!: KycTier;

  @Column({
    type: 'enum',
    enum: KycVerificationStatus,
    default: KycVerificationStatus.PENDING,
  })
  status!: KycVerificationStatus;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Index({ unique: true })
  @Column({ name: 'provider_reference', type: 'varchar', length: 128 })
  providerReference!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
