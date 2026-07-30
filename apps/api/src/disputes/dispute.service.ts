import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { computeResolutionSplit } from '@mezzo/shared-types';
import { Dispute } from '../database/entities/dispute.entity';
import { DisputeEvent } from '../database/entities/dispute-event.entity';
import { EscrowEvent } from '../database/entities/escrow-event.entity';
import { EvidenceItem } from '../database/entities/evidence-item.entity';
import { EvidenceFlag } from '../database/entities/evidence-flag.entity';
import { ArbitrationRecord } from '../database/entities/arbitration-record.entity';
import { RequestContextService } from '../common/context/request-context';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../observability/metrics.service';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { DisputeReasonCode } from './entities/dispute-reason-code.enum';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowStateMachine } from '../escrow/escrow-state-machine';
import { OnlyBuyerMayActError } from '../escrow/errors/only-buyer-may-act.error';
import { EvidencePhase } from '../evidence/entities/evidence-phase.enum';
import { toEvidenceItemResponse } from '../evidence/dto/evidence-response';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/entities/notification-event-type.enum';
import { LedgerService, PostingLine } from '../ledger/ledger.service';
import { escrowHoldingRef, platformFeeRevenueRef, userWalletRef } from '../ledger/account-refs';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { Money } from '../common/money/money';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import { NotEscrowPartyError } from '../escrow/errors/not-escrow-party.error';
import { DisputeState } from './entities/dispute-state.enum';
import { DisputeResolutionOutcome } from './entities/dispute-resolution-outcome.enum';
import { DisputeStateMachine } from './dispute-state-machine';
import { MissingDisputeEvidenceError } from './errors/missing-dispute-evidence.error';
import { RaiseDisputeDto, ResolveDisputeDto } from './dto/dispute.schemas';
import { DisputePacketResponse, toDisputeResponse, toTimeline } from './dto/dispute-response';
import {
  DISPUTE_EVIDENCE_WINDOW_JOB,
  DISPUTE_EVIDENCE_WINDOW_QUEUE,
  disputeEvidenceWindowJobId,
} from './dispute-evidence-window-queue.constants';
import { IllegalDisputeTransitionError } from './errors/illegal-dispute-transition.error';
import { StaleDisputeVersionError } from './errors/stale-dispute-version.error';
import { UnknownArbitrationRecordError } from './errors/unknown-arbitration-record.error';

@Injectable()
export class DisputeService {
  constructor(
    @InjectRepository(Dispute)
    private readonly disputes: Repository<Dispute>,
    @InjectRepository(DisputeEvent)
    private readonly disputeEvents: Repository<DisputeEvent>,
    @InjectRepository(EscrowEvent)
    private readonly escrowEvents: Repository<EscrowEvent>,
    @InjectRepository(EvidenceItem)
    private readonly evidenceItems: Repository<EvidenceItem>,
    @InjectRepository(EvidenceFlag)
    private readonly evidenceFlags: Repository<EvidenceFlag>,
    @InjectRepository(ArbitrationRecord)
    private readonly arbitrationRecords: Repository<ArbitrationRecord>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly escrowService: EscrowService,
    private readonly escrowStateMachine: EscrowStateMachine,
    private readonly disputeStateMachine: DisputeStateMachine,
    private readonly ledgerService: LedgerService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly notificationsService: NotificationsService,
    private readonly requestContext: RequestContextService,
    private readonly auditService: AuditService,
    private readonly metricsService: MetricsService,
    @InjectQueue(DISPUTE_EVIDENCE_WINDOW_QUEUE)
    private readonly evidenceWindowQueue: Queue,
  ) {}

  async raise(escrowId: string, actorId: string, dto: RaiseDisputeDto): Promise<Dispute> {
    const { parties } = await this.escrowService.getDetail(escrowId);
    const buyer = parties.find((party) => party.role === EscrowRole.BUYER);
    if (!buyer || buyer.userId !== actorId) {
      throw new OnlyBuyerMayActError('raise a dispute');
    }

    const buyerEvidenceCount = await this.evidenceItems.count({
      where: { escrowId, phase: EvidencePhase.AT_DELIVERY, uploaderId: actorId },
    });
    if (buyerEvidenceCount === 0) {
      throw new MissingDisputeEvidenceError();
    }

    const windowHours = this.configService.getOrThrow<number>('DISPUTE_EVIDENCE_WINDOW_HOURS');
    const windowMs = windowHours * 60 * 60 * 1000;
    const evidenceWindowExpiresAt = new Date(Date.now() + windowMs);

    let disputedEscrowVersion = 0;
    const dispute = await this.dataSource.transaction(async (manager) => {
      const disputedEscrow = await this.escrowStateMachine.transition(
        escrowId,
        EscrowState.DISPUTED,
        { actorId, reason: `Buyer raised a dispute: ${dto.reasonCode}` },
        manager,
      );
      disputedEscrowVersion = disputedEscrow.version;

      const saved = await manager.save(
        Dispute,
        manager.create(Dispute, {
          escrowId,
          raisedByUserId: actorId,
          reasonCode: dto.reasonCode as DisputeReasonCode,
          statement: dto.statement,
          evidenceWindowExpiresAt,
        }),
      );

      return this.disputeStateMachine.transition(
        saved.id,
        DisputeState.EVIDENCE,
        { actorId, reason: 'Evidence window opened' },
        manager,
      );
    });

    await this.evidenceWindowQueue.add(
      DISPUTE_EVIDENCE_WINDOW_JOB,
      { disputeId: dispute.id },
      { jobId: disputeEvidenceWindowJobId(dispute.id), delay: windowMs },
    );

    await this.notificationsService.notify({
      escrowId,
      sourceEventId: `${escrowId}_${EscrowState.DISPUTED}_${disputedEscrowVersion}`,
      eventType: NotificationEventType.DISPUTED,
      recipientUserIds: parties.map((party) => party.userId),
    });

    this.metricsService.incrementDisputeRaised();

    return dispute;
  }

  async listByEscrow(escrowId: string, currentUser: AuthenticatedUser): Promise<Dispute[]> {
    const isArbiter = currentUser.role === UserRole.ARBITER || currentUser.role === UserRole.ADMIN;
    if (!isArbiter) {
      await this.escrowService.assertIsParty(escrowId, currentUser.id);
    }

    return this.disputes.find({ where: { escrowId }, order: { createdAt: 'DESC' } });
  }

  async listByState(state?: DisputeState): Promise<Dispute[]> {
    return this.disputes.find({
      where: state ? { state } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async closeEvidenceWindow(disputeId: string, actorId: string | null): Promise<Dispute> {
    return this.disputeStateMachine.transitionIdempotent(disputeId, DisputeState.UNDER_REVIEW, {
      actorId,
      reason: 'Evidence window closed',
    });
  }

  async autoCloseEvidenceWindow(disputeId: string): Promise<void> {
    try {
      await this.closeEvidenceWindow(disputeId, null);
    } catch (error) {
      if (error instanceof IllegalDisputeTransitionError || error instanceof StaleDisputeVersionError) {
        return;
      }
      throw error;
    }
  }

  async resolve(disputeId: string, actorId: string, dto: ResolveDisputeDto): Promise<Dispute> {
    const dispute = await this.disputes.findOne({ where: { id: disputeId } });
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }
    if (dispute.state === DisputeState.RESOLVED) {
      return dispute;
    }

    const { terms, parties } = await this.escrowService.getDetail(dispute.escrowId);
    if (!terms) {
      throw new NotFoundException('Escrow terms not found');
    }
    const buyer = parties.find((party) => party.role === EscrowRole.BUYER);
    const seller = parties.find((party) => party.role === EscrowRole.SELLER);
    if (!buyer || !seller) {
      throw new NotFoundException('Escrow parties not found');
    }

    if (dto.arbitrationRecordId) {
      const record = await this.arbitrationRecords.findOne({ where: { id: dto.arbitrationRecordId } });
      if (!record || record.disputeId !== disputeId) {
        throw new UnknownArbitrationRecordError();
      }
    }

    const correlationId = this.requestContext.correlationId() ?? randomUUID();

    const outcome = dto.outcome as DisputeResolutionOutcome;
    const price = Money.of(terms.priceAmount, terms.priceCurrency);
    const split = computeResolutionSplit(price.amount, terms.feeBps, dto.outcome, dto.splitSellerBps);
    const sellerAmount = Money.of(split.sellerAmount, price.currency);
    const feeAmount = Money.of(split.feeAmount, price.currency);
    const buyerAmount = Money.of(split.buyerAmount, price.currency);

    const intermediateState =
      outcome === DisputeResolutionOutcome.REFUND_TO_BUYER
        ? EscrowState.RESOLVED_REFUND
        : EscrowState.RESOLVED_RELEASE;
    const terminalState =
      outcome === DisputeResolutionOutcome.REFUND_TO_BUYER
        ? EscrowState.REFUNDED
        : EscrowState.RELEASED;

    const lines: PostingLine[] = [
      { accountRef: escrowHoldingRef(dispute.escrowId), direction: EntryDirection.DEBIT, money: price },
    ];
    if (sellerAmount.amount > 0) {
      lines.push({
        accountRef: userWalletRef(seller.userId),
        direction: EntryDirection.CREDIT,
        money: sellerAmount,
      });
    }
    if (feeAmount.amount > 0) {
      lines.push({
        accountRef: platformFeeRevenueRef(),
        direction: EntryDirection.CREDIT,
        money: feeAmount,
      });
    }
    if (buyerAmount.amount > 0) {
      lines.push({
        accountRef: userWalletRef(buyer.userId),
        direction: EntryDirection.CREDIT,
        money: buyerAmount,
      });
    }

    const resolved = await this.dataSource.transaction(async (manager) => {
      const resolved = await this.disputeStateMachine.transition(
        dispute.id,
        DisputeState.RESOLVED,
        { actorId, reason: `Dispute resolved: ${dto.outcome}`, correlationId },
        manager,
      );

      await this.escrowStateMachine.transition(
        dispute.escrowId,
        intermediateState,
        { actorId, reason: `Dispute resolved: ${dto.outcome}`, correlationId },
        manager,
      );
      await this.escrowStateMachine.transition(
        dispute.escrowId,
        terminalState,
        { actorId, reason: `Dispute resolved: ${dto.outcome}`, correlationId },
        manager,
      );

      await this.ledgerService.postTransaction(
        lines,
        { idempotencyKey: `dispute-resolve:${dispute.id}`, correlationId },
        manager,
      );

      const resolvedAt = new Date();
      await manager.update(Dispute, { id: dispute.id }, {
        resolvedOutcome: outcome,
        resolvedByUserId: actorId,
        resolvedAt,
        resolvedSellerAmount: sellerAmount.amount,
        resolvedBuyerAmount: buyerAmount.amount,
        resolvedFeeAmount: feeAmount.amount,
        resolvedCurrency: price.currency,
        resolvedArbitrationRecordId: dto.arbitrationRecordId ?? null,
      });

      resolved.resolvedOutcome = outcome;
      resolved.resolvedByUserId = actorId;
      resolved.resolvedAt = resolvedAt;
      resolved.resolvedSellerAmount = sellerAmount.amount;
      resolved.resolvedBuyerAmount = buyerAmount.amount;
      resolved.resolvedFeeAmount = feeAmount.amount;
      resolved.resolvedCurrency = price.currency;
      resolved.resolvedArbitrationRecordId = dto.arbitrationRecordId ?? null;

      return resolved;
    });

    await this.notificationsService.notify({
      escrowId: dispute.escrowId,
      sourceEventId: `${dispute.id}_${DisputeState.RESOLVED}_${resolved.version}`,
      eventType: NotificationEventType.RESOLVED,
      recipientUserIds: [buyer.userId, seller.userId],
      correlationId,
    });

    await this.auditService.record({
      actorId,
      action: 'DISPUTE_RESOLUTION_EXECUTED',
      entityType: 'dispute',
      entityId: dispute.id,
      reason: dto.arbitrationRecordId
        ? `Executed per ArbitrationRecord ${dto.arbitrationRecordId}`
        : 'Manual resolution without an AI recommendation',
      before: { state: DisputeState.UNDER_REVIEW },
      after: {
        outcome: dto.outcome,
        sellerAmount: sellerAmount.amount,
        buyerAmount: buyerAmount.amount,
        feeAmount: feeAmount.amount,
        arbitrationRecordId: dto.arbitrationRecordId ?? null,
      },
      correlationId,
    });

    return resolved;
  }

  async getPacket(disputeId: string, currentUser: AuthenticatedUser): Promise<DisputePacketResponse> {
    const dispute = await this.disputes.findOne({ where: { id: disputeId } });
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    const { terms, parties } = await this.escrowService.getDetail(dispute.escrowId);
    if (!terms) {
      throw new NotFoundException('Escrow terms not found');
    }

    const buyer = parties.find((party) => party.role === EscrowRole.BUYER);
    const seller = parties.find((party) => party.role === EscrowRole.SELLER);
    const isParty = parties.some((party) => party.userId === currentUser.id);
    const isArbiter = currentUser.role === UserRole.ARBITER || currentUser.role === UserRole.ADMIN;
    if (!isParty && !isArbiter) {
      throw new NotEscrowPartyError();
    }

    const [escrowEvents, disputeEvents, evidenceItems, chatTranscript] = await Promise.all([
      this.escrowEvents.find({
        where: { escrowId: dispute.escrowId },
        order: { createdAt: 'ASC', id: 'ASC' },
      }),
      this.disputeEvents.find({
        where: { disputeId: dispute.id },
        order: { createdAt: 'ASC', id: 'ASC' },
      }),
      this.evidenceItems.find({
        where: { escrowId: dispute.escrowId },
        order: { createdAt: 'ASC', id: 'ASC' },
      }),
      this.chatService.getTranscript(dispute.escrowId),
    ]);

    const evidenceItemIds = evidenceItems.map((item) => item.id);
    const flags =
      evidenceItemIds.length > 0
        ? await this.evidenceFlags.find({ where: { evidenceItemId: In(evidenceItemIds) } })
        : [];

    const creationEvidence = evidenceItems.filter((item) => item.phase === EvidencePhase.AT_CREATION);
    const deliveryEvidence = evidenceItems.filter((item) => item.phase === EvidencePhase.AT_DELIVERY);
    const buyerEvidence = deliveryEvidence.filter((item) => item.uploaderId === buyer?.userId);
    const sellerEvidence = deliveryEvidence.filter((item) => item.uploaderId === seller?.userId);

    return {
      dispute: toDisputeResponse(dispute),
      frozenTerms: {
        price: { amount: terms.priceAmount, currency: terms.priceCurrency },
        inspectionWindowHours: terms.inspectionWindowHours,
        deliveryMethod: terms.deliveryMethod,
        itemDescription: terms.itemDescription,
        feeBps: terms.feeBps,
      },
      timeline: toTimeline(escrowEvents, disputeEvents),
      creationEvidence: creationEvidence.map((item) => toEvidenceItemResponse(item, flags)),
      buyerEvidence: buyerEvidence.map((item) => toEvidenceItemResponse(item, flags)),
      sellerEvidence: sellerEvidence.map((item) => toEvidenceItemResponse(item, flags)),
      submissionFlags: {
        buyerSubmitted: buyerEvidence.length > 0,
        sellerSubmitted: sellerEvidence.length > 0,
        evidenceWindowElapsed: Date.now() >= dispute.evidenceWindowExpiresAt.getTime(),
      },
      chatTranscript,
    };
  }
}
