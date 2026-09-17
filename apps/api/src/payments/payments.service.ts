import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { PaymentWebhookEvent } from '../database/entities/payment-webhook-event.entity';
import { PaymentIntentStatus } from './entities/payment-intent-status.enum';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowStateMachine } from '../escrow/escrow-state-machine';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { LedgerService } from '../ledger/ledger.service';
import { escrowHoldingRef, providerClearingRef } from '../ledger/account-refs';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { KycService } from '../kyc/kyc.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/entities/notification-event-type.enum';
import { Money } from '../common/money/money';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider.interface';
import { TracingService } from '../observability/tracing.service';
import { PayoutService } from './payout.service';
import { WebhookSignatureService } from './webhook-signature.service';
import { FlutterwaveWebhookDto, PaystackWebhookDto } from './dto/payments.schemas';
import {
  PaymentWebhookEventInput,
  normalizeFlutterwaveWebhook,
  normalizePaystackWebhook,
} from './webhook-event';
import {
  LatestPaymentIntentResponse,
  PaymentIntentResponse,
  toPaymentIntentResponse,
} from './dto/payments-response';
import { EscrowNotAgreedError } from './errors/escrow-not-agreed.error';
import { OnlyBuyerMayFundError } from './errors/only-buyer-may-fund.error';
import { IntentNotQuarantinedError } from './errors/intent-not-quarantined.error';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentIntent)
    private readonly intents: Repository<PaymentIntent>,
    @InjectRepository(PaymentWebhookEvent)
    private readonly webhookEvents: Repository<PaymentWebhookEvent>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly escrowService: EscrowService,
    private readonly stateMachine: EscrowStateMachine,
    private readonly ledgerService: LedgerService,
    private readonly kycService: KycService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly payoutService: PayoutService,
    private readonly notificationsService: NotificationsService,
    private readonly tracingService: TracingService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    private readonly webhookSignature: WebhookSignatureService,
  ) {}

  private async generatePaymentReference(): Promise<string> {
    const [{ value }] = await this.dataSource.query<[{ value: string }]>(
      "SELECT nextval('payment_reference_seq') AS value",
    );
    return `PAY-${value.padStart(6, '0')}`;
  }

  async initiateFunding(buyerId: string, escrowId: string): Promise<PaymentIntentResponse> {
    const { escrow, terms, parties } = await this.escrowService.getDetail(escrowId);

    const buyerParty = parties.find((party) => party.role === EscrowRole.BUYER);
    if (!buyerParty || buyerParty.userId !== buyerId) {
      throw new OnlyBuyerMayFundError();
    }

    if (escrow.state !== EscrowState.AGREED) {
      throw new EscrowNotAgreedError(escrow.state);
    }

    if (!terms) {
      throw new NotFoundException('Escrow terms not found');
    }

    const price = Money.of(terms.priceAmount, terms.priceCurrency);
    const exemptThresholdKobo = this.configService.getOrThrow<number>(
      'KYC_VERIFICATION_EXEMPT_THRESHOLD_KOBO',
    );
    const requiresVerification = terms.requiresVerification || price.amount >= exemptThresholdKobo;
    await this.kycService.assertCanFund(buyerId, price, requiresVerification);

    const existing = await this.intents.findOne({
      where: { escrowId },
      order: { createdAt: 'DESC' },
    });
    const refreshable =
      existing?.status === PaymentIntentStatus.PENDING &&
      existing.provider === this.paymentProvider.name
        ? existing
        : null;
    if (existing && existing.status !== PaymentIntentStatus.QUARANTINED && !refreshable) {
      return toPaymentIntentResponse(existing, existing.authorizationUrl);
    }

    const buyer = await this.usersService.findById(buyerId);
    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    const reference = refreshable?.providerReference ?? (await this.generatePaymentReference());
    const { authorizationUrl } = await this.paymentProvider.initializeTransaction({
      email: buyer.email,
      amountKobo: price.amount,
      currency: price.currency,
      reference,
      escrowId,
      metadata: { escrowId },
    });

    if (refreshable) {
      refreshable.authorizationUrl = authorizationUrl;
      const refreshed = await this.intents.save(refreshable);
      return toPaymentIntentResponse(refreshed, authorizationUrl);
    }

    const intent = await this.intents.save(
      this.intents.create({
        escrowId,
        buyerId,
        amount: price.amount,
        currency: price.currency,
        provider: this.paymentProvider.name,
        providerReference: reference,
        status: PaymentIntentStatus.PENDING,
        authorizationUrl,
      }),
    );

    return toPaymentIntentResponse(intent, authorizationUrl);
  }

  async getLatestIntent(userId: string, escrowId: string): Promise<LatestPaymentIntentResponse> {
    await this.escrowService.assertIsParty(escrowId, userId);

    const intent = await this.intents.findOne({
      where: { escrowId },
      order: { createdAt: 'DESC' },
    });

    return { intent: intent ? toPaymentIntentResponse(intent) : null };
  }

  async listAllIntents(status?: PaymentIntentStatus): Promise<PaymentIntent[]> {
    return this.intents.find({ where: status ? { status } : {}, order: { createdAt: 'DESC' } });
  }

  async listIntentsForUser(buyerId: string): Promise<PaymentIntent[]> {
    return this.intents.find({ where: { buyerId }, order: { createdAt: 'DESC' } });
  }

  async resolveQuarantinedIntent(intentId: string): Promise<PaymentIntent> {
    const intent = await this.intents.findOne({ where: { id: intentId } });
    if (!intent || intent.status !== PaymentIntentStatus.QUARANTINED) {
      throw new IntentNotQuarantinedError();
    }

    intent.status = PaymentIntentStatus.PENDING;
    return this.intents.save(intent);
  }

  async handlePaystackWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    dto: PaystackWebhookDto,
  ): Promise<void> {
    return this.tracingService.withSpan('payments.handleWebhook', () => {
      this.webhookSignature.verifyPaystack(rawBody, signatureHeader);
      return this.processWebhook(normalizePaystackWebhook(dto));
    });
  }

  async handleFlutterwaveWebhook(
    signatureHeader: string | undefined,
    dto: FlutterwaveWebhookDto,
  ): Promise<void> {
    return this.tracingService.withSpan('payments.handleWebhook', () => {
      this.webhookSignature.verifyFlutterwave(signatureHeader);
      return this.processWebhook(normalizeFlutterwaveWebhook(dto));
    });
  }

  private async processWebhook(event: PaymentWebhookEventInput): Promise<void> {
    const alreadyProcessed = await this.webhookEvents.findOne({
      where: { provider: event.provider, providerEventId: event.eventId },
    });
    if (alreadyProcessed) {
      return;
    }

    if (event.kind === 'transfer') {
      await this.payoutService.handleTransferWebhook(event);
      await this.recordWebhookEvent(event, null);
      return;
    }

    if (event.kind !== 'charge' || !event.succeeded) {
      await this.recordWebhookEvent(event, null);
      return;
    }

    const intent = await this.intents.findOne({ where: { providerReference: event.reference } });
    if (!intent || intent.status !== PaymentIntentStatus.PENDING) {
      await this.recordWebhookEvent(event, intent?.escrowId ?? null);
      return;
    }

    const amountMatches = event.amount === intent.amount && event.currency === intent.currency;

    if (!amountMatches) {
      intent.status = PaymentIntentStatus.QUARANTINED;
      await this.intents.save(intent);
      await this.recordWebhookEvent(event, intent.escrowId);
      return;
    }

    const escrow = await this.dataSource.transaction(async (manager) => {
      await this.ledgerService.postTransaction(
        [
          {
            accountRef: providerClearingRef(intent.provider, intent.currency),
            direction: EntryDirection.DEBIT,
            money: Money.of(intent.amount, intent.currency),
          },
          {
            accountRef: escrowHoldingRef(intent.escrowId),
            direction: EntryDirection.CREDIT,
            money: Money.of(intent.amount, intent.currency),
          },
        ],
        { idempotencyKey: `fund:${intent.id}`, correlationId: intent.id },
        manager,
      );

      const fundedEscrow = await this.stateMachine.transition(
        intent.escrowId,
        EscrowState.FUNDED,
        {
          actorId: null,
          reason: `${event.provider} charge webhook verified`,
          correlationId: intent.id,
        },
        manager,
      );

      intent.status = PaymentIntentStatus.FUNDED;
      await manager.save(PaymentIntent, intent);

      await manager.save(
        PaymentWebhookEvent,
        manager.create(PaymentWebhookEvent, {
          provider: event.provider,
          providerEventId: event.eventId,
          escrowId: intent.escrowId,
        }),
      );

      return fundedEscrow;
    });

    const { parties } = await this.escrowService.getDetail(intent.escrowId);
    await this.notificationsService.notify({
      escrowId: intent.escrowId,
      sourceEventId: `${intent.escrowId}_${escrow.state}_${escrow.version}`,
      eventType: NotificationEventType.FUNDED,
      recipientUserIds: parties.map((party) => party.userId),
    });
  }

  private async recordWebhookEvent(
    event: PaymentWebhookEventInput,
    escrowId: string | null,
  ): Promise<void> {
    await this.webhookEvents.save(
      this.webhookEvents.create({
        provider: event.provider,
        providerEventId: event.eventId,
        escrowId,
      }),
    );
  }
}
