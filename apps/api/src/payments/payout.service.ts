import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Payout } from '../database/entities/payout.entity';
import { PayoutAccount } from '../database/entities/payout-account.entity';
import { PayoutStatus } from './entities/payout-status.enum';
import { LedgerService } from '../ledger/ledger.service';
import { providerClearingRef, userWalletRef } from '../ledger/account-refs';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { KycService } from '../kyc/kyc.service';
import { KycTier } from '../kyc/entities/kyc-tier.enum';
import { Money } from '../common/money/money';
import { Bank, PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider.interface';
import { PayoutAccountInput, RequestPayoutDto } from './dto/payout.schemas';
import { PayoutResponse, toPayoutResponse } from './dto/payout-response';
import { PayoutAccountResponse, toPayoutAccountResponse } from './dto/payout-account-response';
import { VerifyPayoutAccountResponse } from '@mezzo/shared-types';
import { PaymentWebhookEventInput } from './webhook-event';
import { InsufficientWalletBalanceError } from './errors/insufficient-wallet-balance.error';
import { PayoutNotFailedError } from './errors/payout-not-failed.error';
import { PayoutAccountNotConfiguredError } from './errors/payout-account-not-configured.error';
import { PayoutAccountVerificationMismatchError } from './errors/payout-account-verification-mismatch.error';
import { UnknownBankError } from './errors/unknown-bank.error';

function normalizeAccountName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

@Injectable()
export class PayoutService {
  constructor(
    @InjectRepository(Payout)
    private readonly payouts: Repository<Payout>,
    @InjectRepository(PayoutAccount)
    private readonly payoutAccounts: Repository<PayoutAccount>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly ledgerService: LedgerService,
    private readonly kycService: KycService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  async listBanks(): Promise<Bank[]> {
    return this.paymentProvider.listBanks();
  }

  async verifyAccount(input: PayoutAccountInput): Promise<VerifyPayoutAccountResponse> {
    return this.paymentProvider.resolveAccount(input);
  }

  async getPayoutAccount(sellerId: string): Promise<PayoutAccountResponse | null> {
    const account = await this.payoutAccounts.findOne({ where: { userId: sellerId } });
    return account ? toPayoutAccountResponse(account) : null;
  }

  async savePayoutAccount(
    sellerId: string,
    input: PayoutAccountInput,
  ): Promise<PayoutAccountResponse> {
    await this.kycService.requireTier(sellerId, KycTier.TIER_1);

    const banks = await this.paymentProvider.listBanks();
    const bank = banks.find((candidate) => candidate.code === input.bankCode);
    if (!bank) {
      throw new UnknownBankError();
    }

    const { accountName } = await this.paymentProvider.resolveAccount(input);

    const existing = await this.payoutAccounts.findOne({ where: { userId: sellerId } });
    const account = existing ?? this.payoutAccounts.create({ userId: sellerId });
    account.bankCode = input.bankCode;
    account.bankName = bank.name;
    account.accountNumber = input.accountNumber;
    account.accountName = accountName;
    account.provider = this.paymentProvider.name;

    const saved = await this.payoutAccounts.save(account);
    return toPayoutAccountResponse(saved);
  }

  async requestPayout(sellerId: string, dto: RequestPayoutDto): Promise<PayoutResponse> {
    await this.kycService.requireTier(sellerId, KycTier.TIER_1);

    const existing = await this.payouts.findOne({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) {
      return toPayoutResponse(existing);
    }

    const payoutAccount = await this.payoutAccounts.findOne({ where: { userId: sellerId } });
    if (!payoutAccount) {
      throw new PayoutAccountNotConfiguredError();
    }

    const requested = Money.of(dto.amount.amount, dto.amount.currency);
    const balance = await this.ledgerService.getBalance(userWalletRef(sellerId));
    if (balance.currency !== requested.currency || balance.amount < requested.amount) {
      throw new InsufficientWalletBalanceError(balance.amount, requested.amount);
    }

    const { accountName } = await this.paymentProvider.resolveAccount({
      accountNumber: payoutAccount.accountNumber,
      bankCode: payoutAccount.bankCode,
    });
    if (normalizeAccountName(accountName) !== normalizeAccountName(payoutAccount.accountName)) {
      throw new PayoutAccountVerificationMismatchError();
    }

    const reference = randomUUID();
    await this.paymentProvider.initiateTransfer({
      amountKobo: requested.amount,
      currency: requested.currency,
      reference,
      accountNumber: payoutAccount.accountNumber,
      bankCode: payoutAccount.bankCode,
      reason: 'Mezzo seller payout',
    });

    const payout = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        Payout,
        manager.create(Payout, {
          sellerId,
          amount: requested.amount,
          currency: requested.currency,
          bankAccountNumber: payoutAccount.accountNumber,
          bankCode: payoutAccount.bankCode,
          provider: this.paymentProvider.name,
          providerReference: reference,
          idempotencyKey: dto.idempotencyKey,
          status: PayoutStatus.PENDING,
        }),
      );

      await this.ledgerService.postTransaction(
        [
          { accountRef: userWalletRef(sellerId), direction: EntryDirection.DEBIT, money: requested },
          {
            accountRef: providerClearingRef(this.paymentProvider.name),
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

  async listAllPayouts(status?: PayoutStatus): Promise<Payout[]> {
    return this.payouts.find({ where: status ? { status } : {}, order: { createdAt: 'DESC' } });
  }

  async retryPayout(payoutId: string): Promise<Payout> {
    const payout = await this.payouts.findOne({ where: { id: payoutId } });
    if (!payout || payout.status !== PayoutStatus.FAILED) {
      throw new PayoutNotFailedError();
    }

    const retried = await this.requestPayout(payout.sellerId, {
      amount: { amount: payout.amount, currency: payout.currency },
      idempotencyKey: randomUUID(),
    });

    const newPayout = await this.payouts.findOne({ where: { id: retried.id } });
    if (!newPayout) {
      throw new NotFoundException('Retried payout not found');
    }
    return newPayout;
  }

  async handleTransferWebhook(event: PaymentWebhookEventInput): Promise<void> {
    const payout = await this.payouts.findOne({ where: { providerReference: event.reference } });
    if (!payout || payout.status !== PayoutStatus.PENDING) {
      return;
    }

    if (event.succeeded) {
      payout.status = PayoutStatus.CONFIRMED;
      await this.payouts.save(payout);
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await this.ledgerService.postTransaction(
        [
          {
            accountRef: providerClearingRef(payout.provider),
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
