import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Escrow } from '../database/entities/escrow.entity';
import { EscrowTerms } from '../database/entities/escrow-terms.entity';
import { EscrowParty } from '../database/entities/escrow-party.entity';
import { Invite } from '../database/entities/invite.entity';
import { EvidenceItem } from '../database/entities/evidence-item.entity';
import { EscrowEvent } from '../database/entities/escrow-event.entity';
import { EscrowState } from './entities/escrow-state.enum';
import { EscrowRole, opposite } from './entities/escrow-role.enum';
import { EscrowStateMachine } from './escrow-state-machine';
import { CreateEscrowDto, UpdateEscrowTermsDto } from './dto/escrow.schemas';
import { Money } from '../common/money/money';
import { NotEscrowPartyError } from './errors/not-escrow-party.error';
import { TermsFrozenError } from './errors/terms-frozen.error';
import { EscrowFullError } from './errors/escrow-full.error';
import { CannotJoinOwnEscrowError } from './errors/cannot-join-own-escrow.error';
import { InviteNotFoundError } from './errors/invite-not-found.error';
import { InviteNoLongerValidError } from './errors/invite-no-longer-valid.error';
import { MissingCreationEvidenceError } from './errors/missing-creation-evidence.error';
import { EvidencePhase } from '../evidence/entities/evidence-phase.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/entities/notification-event-type.enum';

const EDITABLE_STATES: ReadonlySet<EscrowState> = new Set([
  EscrowState.DRAFT,
  EscrowState.PENDING_COUNTERPARTY,
]);

@Injectable()
export class EscrowService {
  constructor(
    @InjectRepository(Escrow)
    private readonly escrows: Repository<Escrow>,
    @InjectRepository(EscrowTerms)
    private readonly terms: Repository<EscrowTerms>,
    @InjectRepository(EscrowParty)
    private readonly parties: Repository<EscrowParty>,
    @InjectRepository(Invite)
    private readonly invites: Repository<Invite>,
    @InjectRepository(EvidenceItem)
    private readonly evidenceItems: Repository<EvidenceItem>,
    @InjectRepository(EscrowEvent)
    private readonly escrowEvents: Repository<EscrowEvent>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stateMachine: EscrowStateMachine,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createDraft(initiatorId: string, dto: CreateEscrowDto): Promise<Escrow> {
    const price = Money.of(dto.price.amount, dto.price.currency);

    return this.dataSource.transaction(async (manager) => {
      const escrow = await manager.save(Escrow, manager.create(Escrow, {}));

      await manager.save(
        EscrowTerms,
        manager.create(EscrowTerms, {
          escrowId: escrow.id,
          priceAmount: price.amount,
          priceCurrency: price.currency,
          inspectionWindowHours: dto.inspectionWindowHours,
          deliveryMethod: dto.deliveryMethod,
          itemDescription: dto.itemDescription,
          feeBps: dto.feeBps,
        }),
      );

      await manager.save(
        EscrowParty,
        manager.create(EscrowParty, {
          escrowId: escrow.id,
          userId: initiatorId,
          role: dto.role as EscrowRole,
          termsAcceptedAt: null,
        }),
      );

      return escrow;
    });
  }

  async invite(escrowId: string, actorId: string): Promise<Invite> {
    await this.assertIsParty(escrowId, actorId);

    const creationEvidenceCount = await this.evidenceItems.count({
      where: { escrowId, phase: EvidencePhase.AT_CREATION },
    });
    if (creationEvidenceCount === 0) {
      throw new MissingCreationEvidenceError();
    }

    const escrow = await this.stateMachine.transition(escrowId, EscrowState.PENDING_COUNTERPARTY, {
      actorId,
      reason: 'Initiator invited a counterparty',
    });

    await this.notificationsService.notify({
      escrowId,
      sourceEventId: `${escrowId}_${escrow.state}_${escrow.version}`,
      eventType: NotificationEventType.INVITED,
      recipientUserIds: [actorId],
    });

    const expiryHours = this.configService.getOrThrow<number>('ESCROW_INVITE_EXPIRY_HOURS');
    const invite = this.invites.create({
      escrowId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000),
      usedAt: null,
      usedByUserId: null,
    });

    return this.invites.save(invite);
  }

  async acceptInvite(token: string, userId: string): Promise<Escrow> {
    const invite = await this.invites.findOne({ where: { token } });
    if (!invite) {
      throw new InviteNotFoundError();
    }
    if (invite.usedAt) {
      throw new InviteNoLongerValidError('used');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new InviteNoLongerValidError('expired');
    }

    const escrow = await this.escrows.findOne({ where: { id: invite.escrowId } });
    if (!escrow) {
      throw new NotFoundException('Escrow not found');
    }
    if (escrow.state !== EscrowState.PENDING_COUNTERPARTY) {
      throw new InviteNoLongerValidError('escrow_unavailable');
    }

    const existingParties = await this.parties.find({ where: { escrowId: invite.escrowId } });
    if (existingParties.length >= 2) {
      throw new EscrowFullError();
    }
    if (existingParties.some((party) => party.userId === userId)) {
      throw new CannotJoinOwnEscrowError();
    }

    const initiatorRole = existingParties[0].role;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(
        EscrowParty,
        manager.create(EscrowParty, {
          escrowId: invite.escrowId,
          userId,
          role: opposite(initiatorRole),
          termsAcceptedAt: null,
        }),
      );

      invite.usedAt = new Date();
      invite.usedByUserId = userId;
      await manager.save(Invite, invite);
    });

    return escrow;
  }

  async acceptTerms(escrowId: string, userId: string): Promise<Escrow> {
    const party = await this.parties.findOne({ where: { escrowId, userId } });
    if (!party) {
      throw new NotEscrowPartyError();
    }

    party.termsAcceptedAt = new Date();
    await this.parties.save(party);

    const allParties = await this.parties.find({ where: { escrowId } });
    const bothAccepted =
      allParties.length === 2 && allParties.every((current) => current.termsAcceptedAt !== null);

    if (bothAccepted) {
      const escrow = await this.stateMachine.transition(escrowId, EscrowState.AGREED, {
        actorId: userId,
        reason: 'Both parties accepted terms',
      });

      await this.notificationsService.notify({
        escrowId,
        sourceEventId: `${escrowId}_${escrow.state}_${escrow.version}`,
        eventType: NotificationEventType.AGREED,
        recipientUserIds: allParties.map((party) => party.userId),
      });

      return escrow;
    }

    const escrow = await this.escrows.findOne({ where: { id: escrowId } });
    if (!escrow) {
      throw new NotFoundException('Escrow not found');
    }
    return escrow;
  }

  async updateTerms(
    escrowId: string,
    actorId: string,
    dto: UpdateEscrowTermsDto,
  ): Promise<EscrowTerms> {
    const escrow = await this.escrows.findOne({ where: { id: escrowId } });
    if (!escrow) {
      throw new NotFoundException('Escrow not found');
    }
    if (!EDITABLE_STATES.has(escrow.state)) {
      throw new TermsFrozenError();
    }

    const party = await this.parties.findOne({ where: { escrowId, userId: actorId } });
    if (!party) {
      throw new NotEscrowPartyError();
    }

    const terms = await this.terms.findOne({ where: { escrowId } });
    if (!terms) {
      throw new NotFoundException('Escrow terms not found');
    }

    const price = Money.of(dto.price.amount, dto.price.currency);
    terms.priceAmount = price.amount;
    terms.priceCurrency = price.currency;
    terms.inspectionWindowHours = dto.inspectionWindowHours;
    terms.deliveryMethod = dto.deliveryMethod;
    terms.itemDescription = dto.itemDescription;
    terms.feeBps = dto.feeBps;

    return this.terms.save(terms);
  }

  async cancel(escrowId: string, actorId: string): Promise<Escrow> {
    return this.stateMachine.transitionIdempotent(escrowId, EscrowState.CANCELLED, {
      actorId,
      reason: 'Cancelled by a party',
    });
  }

  async getDetail(
    escrowId: string,
  ): Promise<{ escrow: Escrow; terms: EscrowTerms | null; parties: EscrowParty[] }> {
    const escrow = await this.escrows.findOne({ where: { id: escrowId } });
    if (!escrow) {
      throw new NotFoundException('Escrow not found');
    }

    const [terms, parties] = await Promise.all([
      this.terms.findOne({ where: { escrowId } }),
      this.parties.find({ where: { escrowId } }),
    ]);

    return { escrow, terms, parties };
  }

  async assertIsParty(escrowId: string, userId: string): Promise<void> {
    const party = await this.parties.findOne({ where: { escrowId, userId } });
    if (!party) {
      throw new NotEscrowPartyError();
    }
  }

  async hasEverBeenDisputed(escrowId: string): Promise<boolean> {
    const count = await this.escrowEvents.count({
      where: { escrowId, toState: EscrowState.DISPUTED },
    });
    return count > 0;
  }
}
