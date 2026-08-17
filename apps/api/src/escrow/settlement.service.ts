import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { Escrow } from '../database/entities/escrow.entity';
import { EscrowState } from './entities/escrow-state.enum';
import { EscrowRole } from './entities/escrow-role.enum';
import { EscrowService } from './escrow.service';
import { EscrowStateMachine } from './escrow-state-machine';
import { LedgerService } from '../ledger/ledger.service';
import { escrowHoldingRef, platformFeeRevenueRef, userWalletRef } from '../ledger/account-refs';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { Money } from '../common/money/money';
import { EscrowTerms } from '../database/entities/escrow-terms.entity';
import { computeFeeSplit } from './fee-split';
import { ShipEscrowDto } from './dto/settlement.schemas';
import { OnlySellerMayActError } from './errors/only-seller-may-act.error';
import { OnlyBuyerMayActError } from './errors/only-buyer-may-act.error';
import { IllegalTransitionError } from './errors/illegal-transition.error';
import { StaleEscrowVersionError } from './errors/stale-escrow-version.error';
import { AUTO_RELEASE_JOB, AUTO_RELEASE_QUEUE, autoReleaseJobId } from './auto-release-queue.constants';
import {
  INSPECTION_ENDING_SOON_JOB,
  INSPECTION_ENDING_SOON_QUEUE,
  inspectionEndingSoonJobId,
} from './inspection-ending-soon-queue.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/entities/notification-event-type.enum';
import { MetricsService } from '../observability/metrics.service';
import { TracingService } from '../observability/tracing.service';
import { withTimeout } from '../common/with-timeout';

@Injectable()
export class SettlementService {
  constructor(
    @InjectRepository(Escrow)
    private readonly escrows: Repository<Escrow>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly escrowService: EscrowService,
    private readonly stateMachine: EscrowStateMachine,
    private readonly ledgerService: LedgerService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly metricsService: MetricsService,
    private readonly tracingService: TracingService,
    @InjectQueue(AUTO_RELEASE_QUEUE)
    private readonly autoReleaseQueue: Queue,
    @InjectQueue(INSPECTION_ENDING_SOON_QUEUE)
    private readonly inspectionEndingSoonQueue: Queue,
  ) {}

  async ship(escrowId: string, actorId: string, dto: ShipEscrowDto): Promise<Escrow> {
    const { parties } = await this.escrowService.getDetail(escrowId);
    const seller = parties.find((party) => party.role === EscrowRole.SELLER);
    if (!seller || seller.userId !== actorId) {
      throw new OnlySellerMayActError('mark the escrow as shipped');
    }

    const escrow = await this.stateMachine.transition(escrowId, EscrowState.SHIPPED, {
      actorId,
      reason: 'Seller marked as shipped',
    });

    if (dto.trackingReference) {
      await this.escrows.update({ id: escrowId }, { trackingReference: dto.trackingReference });
      escrow.trackingReference = dto.trackingReference;
    }

    await this.notificationsService.notify({
      escrowId,
      sourceEventId: `${escrowId}_${escrow.state}_${escrow.version}`,
      eventType: NotificationEventType.SHIPPED,
      recipientUserIds: parties.map((party) => party.userId),
    });

    return escrow;
  }

  async confirmDelivery(escrowId: string, actorId: string): Promise<Escrow> {
    const { terms, parties } = await this.escrowService.getDetail(escrowId);
    const buyer = parties.find((party) => party.role === EscrowRole.BUYER);
    if (!buyer || buyer.userId !== actorId) {
      throw new OnlyBuyerMayActError('confirm delivery');
    }
    if (!terms) {
      throw new NotFoundException('Escrow terms not found');
    }

    const escrow = await this.stateMachine.transition(escrowId, EscrowState.DELIVERED, {
      actorId,
      reason: 'Buyer confirmed delivery',
    });

    const deliveredAt = new Date();
    await this.escrows.update({ id: escrowId }, { deliveredAt });
    escrow.deliveredAt = deliveredAt;

    const enqueueTimeoutMs = this.configService.getOrThrow<number>('QUEUE_ENQUEUE_TIMEOUT_MS');

    const delayMs = terms.inspectionWindowHours * 60 * 60 * 1000;
    await withTimeout(
      this.autoReleaseQueue.add(
        AUTO_RELEASE_JOB,
        { escrowId },
        { jobId: autoReleaseJobId(escrowId), delay: delayMs },
      ),
      enqueueTimeoutMs,
    );

    const leadHours = this.configService.getOrThrow<number>('INSPECTION_ENDING_SOON_LEAD_HOURS');
    const leadMs = Math.min(leadHours * 60 * 60 * 1000, Math.floor(delayMs / 2));
    await withTimeout(
      this.inspectionEndingSoonQueue.add(
        INSPECTION_ENDING_SOON_JOB,
        { escrowId },
        { jobId: inspectionEndingSoonJobId(escrowId), delay: Math.max(delayMs - leadMs, 0) },
      ),
      enqueueTimeoutMs,
    );

    await this.notificationsService.notify({
      escrowId,
      sourceEventId: `${escrowId}_${escrow.state}_${escrow.version}`,
      eventType: NotificationEventType.DELIVERED,
      recipientUserIds: parties.map((party) => party.userId),
    });

    return escrow;
  }

  async notifyInspectionEndingSoon(escrowId: string): Promise<void> {
    const { escrow, parties } = await this.escrowService.getDetail(escrowId);
    if (escrow.state !== EscrowState.DELIVERED) {
      return;
    }

    await this.notificationsService.notify({
      escrowId,
      sourceEventId: `${escrowId}_${NotificationEventType.INSPECTION_ENDING_SOON}_${escrow.version}`,
      eventType: NotificationEventType.INSPECTION_ENDING_SOON,
      recipientUserIds: parties.map((party) => party.userId),
    });
  }

  async release(escrowId: string, actorId: string): Promise<Escrow> {
    const { parties } = await this.escrowService.getDetail(escrowId);
    const buyer = parties.find((party) => party.role === EscrowRole.BUYER);
    if (!buyer || buyer.userId !== actorId) {
      throw new OnlyBuyerMayActError('release the escrow');
    }

    return this.executeRelease(escrowId, actorId);
  }

  async adminRelease(escrowId: string, actorId: string): Promise<Escrow> {
    return this.executeRelease(escrowId, actorId);
  }

  async autoRelease(escrowId: string): Promise<void> {
    try {
      await this.executeRelease(escrowId, null);
      this.metricsService.incrementAutoRelease();
    } catch (error) {
      if (error instanceof IllegalTransitionError || error instanceof StaleEscrowVersionError) {
        return;
      }
      throw error;
    }
  }

  async dispute(escrowId: string, actorId: string): Promise<Escrow> {
    const { parties } = await this.escrowService.getDetail(escrowId);
    const buyer = parties.find((party) => party.role === EscrowRole.BUYER);
    if (!buyer || buyer.userId !== actorId) {
      throw new OnlyBuyerMayActError('raise a dispute');
    }

    return this.stateMachine.transition(escrowId, EscrowState.DISPUTED, {
      actorId,
      reason: 'Buyer raised a dispute',
    });
  }

  async refund(escrowId: string, actorId: string | null): Promise<Escrow> {
    const { terms, parties } = await this.escrowService.getDetail(escrowId);
    if (!terms) {
      throw new NotFoundException('Escrow terms not found');
    }
    const buyer = parties.find((party) => party.role === EscrowRole.BUYER);
    if (!buyer) {
      throw new NotFoundException('Buyer party not found');
    }

    const price = Money.of(terms.priceAmount, terms.priceCurrency);

    return this.tracingService.withSpan('settlement.refund', () =>
      this.dataSource.transaction(async (manager) => {
        const escrow = await this.stateMachine.transition(
          escrowId,
          EscrowState.REFUNDED,
          { actorId, reason: 'Escrow refunded' },
          manager,
        );

        await this.ledgerService.postTransaction(
          [
            { accountRef: escrowHoldingRef(escrowId), direction: EntryDirection.DEBIT, money: price },
            { accountRef: userWalletRef(buyer.userId), direction: EntryDirection.CREDIT, money: price },
          ],
          { idempotencyKey: `refund:${escrowId}`, correlationId: escrowId },
          manager,
        );

        return escrow;
      }),
    );
  }

  private async executeRelease(escrowId: string, actorId: string | null): Promise<Escrow> {
    const { terms, parties } = await this.escrowService.getDetail(escrowId);
    if (!terms) {
      throw new NotFoundException('Escrow terms not found');
    }
    const seller = parties.find((party) => party.role === EscrowRole.SELLER);
    if (!seller) {
      throw new NotFoundException('Seller party not found');
    }

    const { price, sellerAmount, feeAmount } = this.computeReleaseSplit(terms);

    const escrow = await this.tracingService.withSpan('settlement.release', () =>
      this.dataSource.transaction(async (manager) => {
        const releasedEscrow = await this.stateMachine.transition(
          escrowId,
          EscrowState.RELEASED,
          { actorId, reason: 'Escrow released' },
          manager,
        );

        await this.ledgerService.postTransaction(
          [
            { accountRef: escrowHoldingRef(escrowId), direction: EntryDirection.DEBIT, money: price },
            {
              accountRef: userWalletRef(seller.userId),
              direction: EntryDirection.CREDIT,
              money: sellerAmount,
            },
            {
              accountRef: platformFeeRevenueRef(),
              direction: EntryDirection.CREDIT,
              money: feeAmount,
            },
          ],
          { idempotencyKey: `release:${escrowId}`, correlationId: escrowId },
          manager,
        );

        return releasedEscrow;
      }),
    );

    await this.notificationsService.notify({
      escrowId,
      sourceEventId: `${escrowId}_${escrow.state}_${escrow.version}`,
      eventType: NotificationEventType.RELEASED,
      recipientUserIds: parties.map((party) => party.userId),
    });

    return escrow;
  }

  private computeReleaseSplit(terms: EscrowTerms): {
    price: Money;
    sellerAmount: Money;
    feeAmount: Money;
  } {
    const price = Money.of(terms.priceAmount, terms.priceCurrency);
    const { feeAmount, netAmount } = computeFeeSplit(price, terms.feeBps);
    return { price, sellerAmount: netAmount, feeAmount };
  }
}
