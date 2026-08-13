import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Index()
  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType!: string;

  @Index()
  @Column({ name: 'entity_id', type: 'varchar', length: 64 })
  entityId!: string;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState!: Record<string, unknown> | null;

  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState!: Record<string, unknown> | null;

  @Column({ name: 'correlation_id', type: 'uuid', nullable: true })
  correlationId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
