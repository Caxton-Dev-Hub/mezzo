import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { NotificationEventType } from '../../notifications/entities/notification-event-type.enum';
import { NotificationChannelType } from '../../notifications/entities/notification-channel-type.enum';
import { NotificationStatus } from '../../notifications/entities/notification-status.enum';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'escrow_id', type: 'uuid' })
  escrowId!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'event_type', type: 'enum', enum: NotificationEventType })
  eventType!: NotificationEventType;

  @Column({ type: 'enum', enum: NotificationChannelType })
  channel!: NotificationChannelType;

  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.PENDING })
  status!: NotificationStatus;

  @Index({ unique: true })
  @Column({ name: 'dedupe_key', type: 'varchar', length: 255 })
  dedupeKey!: string;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
