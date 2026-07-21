import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
import { Money } from '../common/money/money';
import { PAYSTACK_PROVIDER, PaystackProvider } from './providers/paystack-provider.interface';
import { WebhookSignatureService } from './webhook-signature.service';
import { PaystackWebhookDto } from './dto/payments.schemas';
import { PaymentIntentResponse, toPaymentIntentResponse } from './dto/payments-response';
import { EscrowNotAgreedError } from './errors/escrow-not-agreed.error';
import { OnlyBuyerMayFundError } from './errors/only-buyer-may-fund.error';

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
    @Inject(PAYSTACK_PROVIDER)
    private readonly paystackProvider: PaystackProvider,
    private readonly webhookSignature: WebhookSignatureService,
  ) {}

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
    await this.kycService.assertCanFund(buyerId, price);

    const existing = await this.intents.findOne({
      where: { escrowId },
      order: { createdAt: 'DESC' },
    });
    if (existing && existing.status !== PaymentIntentStatus.QUARANTINED) {
      return toPaymentIntentResponse(existing);
    }

    const buyer = await this.usersService.findById(buyerId);
    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    const reference = randomUUID();
    const { authorizationUrl } = await this.paystackProvider.initializeTransaction({
      email: buyer.email,
      amountKobo: price.amount,
      currency: price.currency,
      reference,
      metadata: { escrowId },
    });

    const intent = await this.intents.save(
      this.intents.create({
        escrowId,
        buyerId,
        amount: price.amount,
        currency: price.currency,
        provider: this.paystackProvider.name,
        providerReference: reference,
        status: PaymentIntentStatus.PENDING,
      }),
    );

    return toPaymentIntentResponse(intent, authorizationUrl);
  }

  async handleWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    dto: PaystackWebhookDto,
  ): Promise<void> {
    this.webhookSignature.verifyPaystack(rawBody, signatureHeader);

    const providerEventId = String(dto.data.id);
    const alreadyProcessed = await this.webhookEvents.findOne({
      where: { provider: this.paystackProvider.name, providerEventId },
    });
    if (alreadyProcessed) {
      return;
    }

    if (dto.event !== 'charge.success') {
      await this.recordWebhookEvent(providerEventId, null);
      return;
    }

    const intent = await this.intents.findOne({ where: { providerReference: dto.data.reference } });
    if (!intent || intent.status !== PaymentIntentStatus.PENDING) {
      await this.recordWebhookEvent(providerEventId, intent?.escrowId ?? null);
      return;
    }

    const amountMatches = dto.data.amount === intent.amount && dto.data.currency === intent.currency;

    if (!amountMatches) {
      intent.status = PaymentIntentStatus.QUARANTINED;
      await this.intents.save(intent);
      await this.recordWebhookEvent(providerEventId, intent.escrowId);
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await this.ledgerService.postTransaction(
        [
          {
            accountRef: providerClearingRef(this.paystackProvider.name),
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

      await this.stateMachine.transition(
        intent.escrowId,
        EscrowState.FUNDED,
        { actorId: null, reason: 'Paystack charge.success webhook verified', correlationId: intent.id },
        manager,
      );

      intent.status = PaymentIntentStatus.FUNDED;
      await manager.save(PaymentIntent, intent);

      await manager.save(
        PaymentWebhookEvent,
        manager.create(PaymentWebhookEvent, {
          provider: this.paystackProvider.name,
          providerEventId,
          escrowId: intent.escrowId,
        }),
      );
    });
  }

  private async recordWebhookEvent(providerEventId: string, escrowId: string | null): Promise<void> {
    await this.webhookEvents.save(
      this.webhookEvents.create({
        provider: this.paystackProvider.name,
        providerEventId,
        escrowId,
      }),
    );
  }
}
