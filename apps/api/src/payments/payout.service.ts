import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Payout } from '../database/entities/payout.entity';
import { PayoutStatus } from './entities/payout-status.enum';
import { LedgerService } from '../ledger/ledger.service';
import { providerClearingRef, userWalletRef } from '../ledger/account-refs';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { KycService } from '../kyc/kyc.service';
import { KycTier } from '../kyc/entities/kyc-tier.enum';
import { Money } from '../common/money/money';
import { PAYSTACK_PROVIDER, PaystackProvider } from './providers/paystack-provider.interface';
import { RequestPayoutDto } from './dto/payout.schemas';
import { PayoutResponse, toPayoutResponse } from './dto/payout-response';
import { PaystackWebhookDto } from './dto/payments.schemas';
import { InsufficientWalletBalanceError } from './errors/insufficient-wallet-balance.error';

@Injectable()
export class PayoutService {
  constructor(
    @InjectRepository(Payout)
    private readonly payouts: Repository<Payout>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly ledgerService: LedgerService,
    private readonly kycService: KycService,
    @Inject(PAYSTACK_PROVIDER)
    private readonly paystackProvider: PaystackProvider,
  ) {}

  async requestPayout(sellerId: string, dto: RequestPayoutDto): Promise<PayoutResponse> {
    await this.kycService.requireTier(sellerId, KycTier.TIER_1);

    const existing = await this.payouts.findOne({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) {
      return toPayoutResponse(existing);
    }

    const requested = Money.of(dto.amount.amount, dto.amount.currency);
    const balance = await this.ledgerService.getBalance(userWalletRef(sellerId));
    if (balance.currency !== requested.currency || balance.amount < requested.amount) {
      throw new InsufficientWalletBalanceError(balance.amount, requested.amount);
    }

    const reference = randomUUID();
    await this.paystackProvider.initiateTransfer({
      amountKobo: requested.amount,
      currency: requested.currency,
      reference,
      accountNumber: dto.bankAccountNumber,
      bankCode: dto.bankCode,
      reason: 'Mezzo seller payout',
    });

    const payout = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        Payout,
        manager.create(Payout, {
          sellerId,
          amount: requested.amount,
          currency: requested.currency,
          bankAccountNumber: dto.bankAccountNumber,
          bankCode: dto.bankCode,
          provider: this.paystackProvider.name,
          providerReference: reference,
          idempotencyKey: dto.idempotencyKey,
          status: PayoutStatus.PENDING,
        }),
      );

      await this.ledgerService.postTransaction(
        [
          { accountRef: userWalletRef(sellerId), direction: EntryDirection.DEBIT, money: requested },
          {
            accountRef: providerClearingRef(this.paystackProvider.name),
            direction: EntryDirection.CREDIT,
            money: requested,
          },
        ],
        { idempotencyKey: `payout:${saved.id}`, correlationId: saved.id },
        manager,
      );

      return saved;
    });

    return toPayoutResponse(payout);
  }

  async listPayouts(sellerId: string): Promise<PayoutResponse[]> {
    const payouts = await this.payouts.find({
      where: { sellerId },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    return payouts.map(toPayoutResponse);
  }

  async handleTransferWebhook(dto: PaystackWebhookDto): Promise<void> {
    const payout = await this.payouts.findOne({ where: { providerReference: dto.data.reference } });
    if (!payout || payout.status !== PayoutStatus.PENDING) {
      return;
    }

    if (dto.data.status === 'success') {
      payout.status = PayoutStatus.CONFIRMED;
      await this.payouts.save(payout);
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await this.ledgerService.postTransaction(
        [
          {
            accountRef: providerClearingRef(this.paystackProvider.name),
            direction: EntryDirection.DEBIT,
            money: Money.of(payout.amount, payout.currency),
          },
          {
            accountRef: userWalletRef(payout.sellerId),
            direction: EntryDirection.CREDIT,
            money: Money.of(payout.amount, payout.currency),
          },
        ],
        { idempotencyKey: `payout-reversal:${payout.id}`, correlationId: payout.id },
        manager,
      );

      payout.status = PayoutStatus.FAILED;
      await manager.save(Payout, payout);
    });
  }
}
