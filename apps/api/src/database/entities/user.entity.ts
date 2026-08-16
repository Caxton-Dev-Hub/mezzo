import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../users/entities/user-role.enum';
import { UserStatus } from '../../users/entities/user-status.enum';
import { KycTier } from '../../kyc/entities/kyc-tier.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash!: string | null;

  @Index({ unique: true })
  @Column({ name: 'google_sub', type: 'varchar', length: 255, nullable: true })
  googleSub!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  @Column({ name: 'kyc_tier', type: 'enum', enum: KycTier, default: KycTier.TIER_0 })
  kycTier!: KycTier;

  @Column({ name: 'business_name', type: 'varchar', length: 80, nullable: true })
  businessName!: string | null;

  @Column({ type: 'varchar', length: 280, nullable: true })
  bio!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  location!: string | null;

  @Column({ name: 'avatar_key', type: 'text', nullable: true })
  avatarKey!: string | null;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
