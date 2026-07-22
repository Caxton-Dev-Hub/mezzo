import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Escrow } from '../database/entities/escrow.entity';
import { EscrowTerms } from '../database/entities/escrow-terms.entity';
import { EscrowParty } from '../database/entities/escrow-party.entity';
import { EscrowEvent } from '../database/entities/escrow-event.entity';
import { Invite } from '../database/entities/invite.entity';
import { EvidenceItem } from '../database/entities/evidence-item.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ObservabilityModule } from '../observability/observability.module';
import { EscrowStateMachine } from './escrow-state-machine';
import { EscrowService } from './escrow.service';
import { SettlementService } from './settlement.service';
import { AutoReleaseProcessor } from './auto-release.processor';
import { InspectionEndingSoonProcessor } from './inspection-ending-soon.processor';
import { EscrowController } from './escrow.controller';
import { InviteController } from './invite.controller';
import { SettlementController } from './settlement.controller';
import { AUTO_RELEASE_QUEUE } from './auto-release-queue.constants';
import { INSPECTION_ENDING_SOON_QUEUE } from './inspection-ending-soon-queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Escrow, EscrowTerms, EscrowParty, EscrowEvent, Invite, EvidenceItem]),
    BullModule.registerQueue({ name: AUTO_RELEASE_QUEUE }, { name: INSPECTION_ENDING_SOON_QUEUE }),
    LedgerModule,
    NotificationsModule,
    ObservabilityModule,
  ],
  controllers: [EscrowController, InviteController, SettlementController],
  providers: [
    EscrowStateMachine,
    EscrowService,
    SettlementService,
    AutoReleaseProcessor,
    InspectionEndingSoonProcessor,
  ],
  exports: [EscrowStateMachine, EscrowService, SettlementService],
})
export class EscrowModule {}
