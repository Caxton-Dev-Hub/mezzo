import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Escrow } from '../database/entities/escrow.entity';
import { EscrowTerms } from '../database/entities/escrow-terms.entity';
import { EscrowParty } from '../database/entities/escrow-party.entity';
import { EscrowEvent } from '../database/entities/escrow-event.entity';
import { Invite } from '../database/entities/invite.entity';
import { EscrowStateMachine } from './escrow-state-machine';
import { EscrowService } from './escrow.service';
import { EscrowController } from './escrow.controller';
import { InviteController } from './invite.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Escrow, EscrowTerms, EscrowParty, EscrowEvent, Invite]),
  ],
  controllers: [EscrowController, InviteController],
  providers: [EscrowStateMachine, EscrowService],
  exports: [EscrowStateMachine, EscrowService],
})
export class EscrowModule {}
