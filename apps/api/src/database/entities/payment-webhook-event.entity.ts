import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('payment_webhook_events')
@Index(['provider', 'providerEventId'], { unique: true })
export class PaymentWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ name: 'provider_event_id', type: 'varchar', length: 128 })
  providerEventId!: string;

  @Column({ name: 'escrow_id', type: 'uuid', nullable: true })
  escrowId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
