import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

const PLATFORM_CURRENCY: Currency = 'NGN';
const ACTIVITY_LIMIT = 20;

const ACTIVITY_KINDS: readonly { prefix: string; kind: WalletActivityKind }[] = [
  { prefix: 'release:', kind: 'ESCROW_RELEASE' },
  { prefix: 'refund:', kind: 'ESCROW_REFUND' },
  { prefix: 'dispute-resolve:', kind: 'DISPUTE_RESOLUTION' },
  { prefix: 'payout-reversal:', kind: 'PAYOUT_REVERSAL' },
  { prefix: 'payout:', kind: 'PAYOUT' },
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
  ) {}

  async getBalances(userId: string): Promise<WalletBalancesResponse> {
    const escrowIds = await this.escrowService.listEscrowIdsForUser(userId);

    const [available, heldInEscrow, pending] = await Promise.all([
      this.ledgerService.getBalanceOrZero(userWalletRef(userId), PLATFORM_CURRENCY),
      this.ledgerService.sumBalances(escrowIds.map(escrowHoldingRef), PLATFORM_CURRENCY),
      this.sumPendingPayouts(userId),
    ]);

    return { available, pending: pending.toJSON(), heldInEscrow };
  }

  async listActivity(userId: string): Promise<WalletActivityResponse[]> {
    const [entries, fundings] = await Promise.all([
      this.ledgerService.listActivity(userWalletRef(userId), ACTIVITY_LIMIT),
      this.intents.find({
        where: { buyerId: userId, status: PaymentIntentStatus.FUNDED },
        order: { updatedAt: 'DESC' },
        take: ACTIVITY_LIMIT,
      }),
    ]);

    const items: WalletActivityResponse[] = [
      ...entries.map((entry) => this.toLedgerActivity(entry)),
      ...fundings.map((intent) => ({
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
