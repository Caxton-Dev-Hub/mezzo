import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import type { WalletActivityKind, WalletActivityResponse, WalletBalancesResponse } from '@mezzo/shared-types';
import { Payout } from '../database/entities/payout.entity';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { PayoutStatus } from './entities/payout-status.enum';
import { PaymentIntentStatus } from './entities/payment-intent-status.enum';
import { EscrowService } from '../escrow/escrow.service';
import { AccountActivity, LedgerService } from '../ledger/ledger.service';
import { escrowHoldingRef, userWalletRef } from '../ledger/account-refs';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { Currency } from '../common/money/currency';
import { Money } from '../common/money/money';
import { UsersService } from '../users/users.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider.interface';
import { Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const PLATFORM_CURRENCY: Currency = 'NGN';
const ACTIVITY_LIMIT = 20;

const ACTIVITY_KINDS: readonly { prefix: string; kind: WalletActivityKind }[] = [
  { prefix: 'release:', kind: 'ESCROW_RELEASE' },
  { prefix: 'refund:', kind: 'ESCROW_REFUND' },
  { prefix: 'dispute-resolve:', kind: 'DISPUTE_RESOLUTION' },
  { prefix: 'payout-reversal:', kind: 'PAYOUT_REVERSAL' },
  { prefix: 'payout:', kind: 'PAYOUT' },
  { prefix: 'wallet-topup:', kind: 'WALLET_TOPUP' },
];

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Payout)
    private readonly payouts: Repository<Payout>,
    @InjectRepository(PaymentIntent)
    private readonly intents: Repository<PaymentIntent>,
    private readonly ledgerService: LedgerService,
    private readonly escrowService: EscrowService,
    private readonly usersService: UsersService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getBalances(userId: string): Promise<WalletBalancesResponse> {
    const escrowIds = await this.escrowService.listEscrowIdsForUser(userId);

    const [available, heldInEscrow, pending] = await Promise.all([
      this.ledgerService.getBalanceOrZero(userWalletRef(userId, PLATFORM_CURRENCY), PLATFORM_CURRENCY),
      this.ledgerService.sumBalances(escrowIds.map(escrowHoldingRef), PLATFORM_CURRENCY),
      this.sumPendingPayouts(userId),
    ]);

    return { available, pending: pending.toJSON(), heldInEscrow };
  }

  async listActivity(userId: string): Promise<WalletActivityResponse[]> {
    const [entries, fundings] = await Promise.all([
      this.ledgerService.listActivity(userWalletRef(userId, PLATFORM_CURRENCY), ACTIVITY_LIMIT),
      this.intents.find({
        where: { buyerId: userId, status: PaymentIntentStatus.FUNDED },
        order: { updatedAt: 'DESC' },
        take: ACTIVITY_LIMIT,
      }),
    ]);

    const items: WalletActivityResponse[] = [
      ...entries.map((entry) => this.toLedgerActivity(entry)),
      ...fundings
        .filter((intent) => intent.fundingType === 'ESCROW')
        .map((intent) => ({
          id: intent.id,
          kind: 'ESCROW_FUNDING' as const,
          direction: 'OUT' as const,
          amount: Money.of(intent.amount, intent.currency).toJSON(),
          escrowId: intent.escrowId,
          occurredAt: intent.updatedAt,
        })),
    ];

    return items
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, ACTIVITY_LIMIT);
  }

  private async generatePaymentReference(): Promise<string> {
    const [{ value }] = await this.dataSource.query<[{ value: string }]>(
      "SELECT nextval('payment_reference_seq') AS value",
    );
    return `PAY-${value.padStart(6, '0')}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  async initiateFunding(userId: string, amountKobo: number): Promise<{ authorizationUrl: string; reference: string }> {
    if (amountKobo < 10000) {
      throw new Error('Minimum funding amount is ₦100');
    }
    if (amountKobo > 10000000) {
      throw new Error('Maximum funding amount is ₦100,000');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const reference = await this.generatePaymentReference();
    const { authorizationUrl } = await this.paymentProvider.initializeTransaction({
      email: user.email,
      amountKobo,
      currency: PLATFORM_CURRENCY,
      reference,
      metadata: { userId, fundingType: 'WALLET' },
    });

    const intent = await this.intents.save(
      this.intents.create({
        escrowId: null,
        buyerId: userId,
        amount: amountKobo,
        currency: PLATFORM_CURRENCY,
        provider: this.paymentProvider.name,
        providerReference: reference,
        status: PaymentIntentStatus.PENDING,
        authorizationUrl,
        fundingType: 'WALLET',
      }),
    );

    return { authorizationUrl, reference: intent.providerReference };
  }

  private async sumPendingPayouts(userId: string): Promise<Money> {
    const pending = await this.payouts.find({
      where: { sellerId: userId, status: PayoutStatus.PENDING, currency: PLATFORM_CURRENCY },
    });

    return pending.reduce(
      (total, payout) => total.add(Money.of(payout.amount, payout.currency)),
      Money.zero(PLATFORM_CURRENCY),
    );
  }

  private toLedgerActivity(entry: AccountActivity): WalletActivityResponse {
    const match = ACTIVITY_KINDS.find(({ prefix }) => entry.idempotencyKey.startsWith(prefix));
    const escrowId =
      match?.kind === 'ESCROW_RELEASE' || match?.kind === 'ESCROW_REFUND'
        ? entry.idempotencyKey.slice(match.prefix.length)
        : null;

    return {
      id: entry.entryId,
      kind: match?.kind ?? 'OTHER',
      direction: entry.direction === EntryDirection.CREDIT ? 'IN' : 'OUT',
      amount: Money.of(entry.amount, entry.currency).toJSON(),
      escrowId,
      occurredAt: entry.createdAt,
    };
  }
}
