import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from '../database/entities/audit-event.entity';

export interface RecordAuditEventInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  correlationId?: string | null;
}

export interface AuditEventFilter {
  entityType?: string;
  entityId?: string;
  limit?: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEvent)
    private readonly events: Repository<AuditEvent>,
  ) {}

  async record(input: RecordAuditEventInput): Promise<AuditEvent> {
    return this.events.save(
      this.events.create({
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        reason: input.reason ?? null,
        beforeState: input.before ?? null,
        afterState: input.after ?? null,
        correlationId: input.correlationId ?? null,
      }),
    );
  }

  async list(filter: AuditEventFilter = {}): Promise<AuditEvent[]> {
    return this.events.find({
      where: {
        ...(filter.entityType ? { entityType: filter.entityType } : {}),
        ...(filter.entityId ? { entityId: filter.entityId } : {}),
      },
      order: { createdAt: 'DESC' },
      take: filter.limit ?? 100,
    });
  }
}
