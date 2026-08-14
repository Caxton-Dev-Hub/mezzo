import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('whatsapp_accounts')
export class WhatsAppAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index({ unique: true })
  @Column({ name: 'phone_number', type: 'varchar', length: 32 })
  phoneNumber!: string;

  @Column({ name: 'verified_at', type: 'timestamptz' })
  verifiedAt!: Date;

  @Column({ name: 'pin_hash', type: 'text', nullable: true })
  pinHash!: string | null;

  @Column({ name: 'pin_failed_attempts', type: 'int', default: 0 })
  pinFailedAttempts!: number;

  @Column({ name: 'pin_locked_until', type: 'timestamptz', nullable: true })
  pinLockedUntil!: Date | null;

  @Column({ name: 'notifications_opted_out_at', type: 'timestamptz', nullable: true })
  notificationsOptedOutAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
