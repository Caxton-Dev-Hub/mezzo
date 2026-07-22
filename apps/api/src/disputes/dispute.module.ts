import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Dispute } from '../database/entities/dispute.entity';
import { DisputeEvent } from '../database/entities/dispute-event.entity';
import { EscrowEvent } from '../database/entities/escrow-event.entity';
import { EvidenceItem } from '../database/entities/evidence-item.entity';
import { EvidenceFlag } from '../database/entities/evidence-flag.entity';
import { ArbitrationRecord } from '../database/entities/arbitration-record.entity';
import { EscrowModule } from '../escrow/escrow.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { ObservabilityModule } from '../observability/observability.module';
import { DisputeStateMachine } from './dispute-state-machine';
import { DisputeService } from './dispute.service';
import { DisputeController } from './dispute.controller';
import { DisputeEvidenceWindowProcessor } from './dispute-evidence-window.processor';
import { DISPUTE_EVIDENCE_WINDOW_QUEUE } from './dispute-evidence-window-queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dispute,
      DisputeEvent,
      EscrowEvent,
      EvidenceItem,
      EvidenceFlag,
      ArbitrationRecord,
    ]),
    BullModule.registerQueue({ name: DISPUTE_EVIDENCE_WINDOW_QUEUE }),
    EscrowModule,
    LedgerModule,
    ChatModule,
    NotificationsModule,
    AuditModule,
    ObservabilityModule,
  ],
  controllers: [DisputeController],
  providers: [DisputeStateMachine, DisputeService, DisputeEvidenceWindowProcessor],
  exports: [DisputeStateMachine, DisputeService],
})
export class DisputeModule {}
