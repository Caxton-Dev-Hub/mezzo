import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { StellarEscrow } from '../database/entities/stellar-escrow.entity';
import { Escrow } from '../database/entities/escrow.entity';
import { AuditService } from '../audit/audit.service';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { computeFeeSplit } from '../escrow/fee-split';
import { Money } from '../common/money/money';
import { StellarEscrowStatus } from './entities/stellar-escrow-status.enum';
import { StellarConfigService } from './stellar-config.service';
import { StellarWalletService } from './stellar-wallet.service';
import { toStellarAmount } from './stellar-amount';
import { STELLAR_AUDIT_ACTIONS, STELLAR_ESCROW_ENTITY } from './stellar-audit-actions';
import { STELLAR_NETWORK, StellarNetworkClient } from './providers/stellar-network.interface';
import { StellarAccountNotLinkedError } from './errors/stellar-account-not-linked.error';
import { StellarSettlementNotStuckError } from './errors/stellar-settlement-not-stuck.error';

const SETTLEABLE_STATES: readonly EscrowState[] = [EscrowState.RELEASED, EscrowState.REFUNDED];
const SWEEPABLE_STATUSES: readonly StellarEscrowStatus[] = [
  StellarEscrowStatus.FUNDED,
  StellarEscrowStatus.SETTLING,
];

export interface StellarSettlementOutcome {
  escrowId: string;
  settled: boolean;
  transactionHash: string | null;
  blockedBy: string | null;
}

interface StellarPayout {
  recipientUserId: string;
  destinationAccountId: string;
  amount: string;
}

@Injectable()
export class StellarSettlementService {
  private readonly logger = new Logger(StellarSettlementService.name);

  constructor(
    @InjectRepository(StellarEscrow)
    private readonly stellarEscrows: Repository<StellarEscrow>,
    @Inject(STELLAR_NETWORK)
    private readonly network: StellarNetworkClient,
    private readonly stellarConfig: StellarConfigService,
    private readonly escrowService: EscrowService,
    private readonly walletService: StellarWalletService,
    private readonly auditService: AuditService,
  ) {}

  async settleDue(actorId: string | null = null): Promise<StellarSettlementOutcome[]> {
    this.stellarConfig.assertEnabled();

    const due = await this.stellarEscrows
      .createQueryBuilder('stellarEscrow')
      .innerJoin(Escrow, 'escrow', 'escrow.id = stellarEscrow.escrow_id')
      .where('stellarEscrow.status IN (:...statuses)', { statuses: SWEEPABLE_STATUSES })
      .andWhere('escrow.state IN (:...states)', { states: SETTLEABLE_STATES })
      .orderBy('stellarEscrow.created_at', 'ASC')
      .getMany();

    const outcomes: StellarSettlementOutcome[] = [];
    for (const stellarEscrow of due) {
      outcomes.push(await this.settleOne(stellarEscrow, actorId));
    }
    return outcomes;
  }

  async requeue(escrowId: string, actorId: string): Promise<StellarEscrow> {
    this.stellarConfig.assertEnabled();

    const released = await this.stellarEscrows.update(
      { escrowId, status: StellarEscrowStatus.SETTLING, settlementAttemptHash: IsNull() },
      { status: StellarEscrowStatus.FUNDED },
    );
    if (released.affected !== 1) {
      throw new StellarSettlementNotStuckError(escrowId);
    }

    await this.auditService.record({
      actorId,
      action: STELLAR_AUDIT_ACTIONS.SETTLEMENT_CLAIMED,
      entityType: STELLAR_ESCROW_ENTITY,
      entityId: escrowId,
      reason: 'Operator requeued a payout that was claimed but never submitted',
      before: { status: StellarEscrowStatus.SETTLING },
      after: { status: StellarEscrowStatus.FUNDED },
      correlationId: escrowId,
    });

    return this.stellarEscrows.findOneOrFail({ where: { escrowId } });
  }

  private async settleOne(
    stellarEscrow: StellarEscrow,
    actorId: string | null,
  ): Promise<StellarSettlementOutcome> {
    const { escrowId } = stellarEscrow;

    if (stellarEscrow.status === StellarEscrowStatus.SETTLING) {
      const resolved = await this.reconcile(stellarEscrow, actorId);
      if (resolved) {
        return resolved;
      }
    }

    const payout = await this.resolvePayout(stellarEscrow);
    if (typeof payout === 'string') {
      return this.blocked(escrowId, payout, actorId);
    }

    if (!(await this.claim(stellarEscrow))) {
      return this.blocked(escrowId, 'Another settlement run already holds this payout', actorId);
    }

    let prepared;
    try {
      prepared = await this.network.preparePayment({
        from: stellarEscrow.depositAccountId,
        to: payout.destinationAccountId,
        amount: payout.amount,
        memo: stellarEscrow.memo,
      });
    } catch (error) {
      await this.release(stellarEscrow);
      return this.blocked(
        escrowId,
        `The payout could not be prepared, and nothing was submitted: ${String(error)}`,
        actorId,
      );
    }

    await this.stellarEscrows.update(
      { id: stellarEscrow.id },
      {
        settlementAttemptHash: prepared.transactionHash,
        settlementAttemptExpiresAt: prepared.expiresAt,
      },
    );

    let transactionHash: string;
    try {
      transactionHash = await prepared.submit();
    } catch (error) {
      return this.uncertain(stellarEscrow, prepared.transactionHash, actorId, error);
    }

    await this.markSettled(stellarEscrow.id, transactionHash);

    await this.auditService.record({
      actorId,
      action: STELLAR_AUDIT_ACTIONS.SETTLEMENT_PAID,
      entityType: STELLAR_ESCROW_ENTITY,
      entityId: escrowId,
      reason: `Paid ${payout.amount} ${stellarEscrow.assetCode} to ${payout.destinationAccountId}`,
      before: { status: StellarEscrowStatus.SETTLING },
      after: {
        status: StellarEscrowStatus.SETTLED,
        transactionHash,
        recipientUserId: payout.recipientUserId,
        destinationAccountId: payout.destinationAccountId,
        amount: payout.amount,
        assetCode: stellarEscrow.assetCode,
        assetIssuer: stellarEscrow.assetIssuer,
      },
      correlationId: escrowId,
    });

    return { escrowId, settled: true, transactionHash, blockedBy: null };
  }

  private async reconcile(
    stellarEscrow: StellarEscrow,
    actorId: string | null,
  ): Promise<StellarSettlementOutcome | null> {
    const { escrowId, settlementAttemptHash } = stellarEscrow;

    if (!settlementAttemptHash) {
      return this.blocked(
        escrowId,
        'A payout was claimed but never recorded; requeue it once the chain has been checked',
        actorId,
      );
    }

    const outcome = await this.network.findTransaction(settlementAttemptHash);

    if (outcome?.successful) {
      await this.markSettled(stellarEscrow.id, settlementAttemptHash);
      await this.auditService.record({
        actorId,
        action: STELLAR_AUDIT_ACTIONS.SETTLEMENT_PAID,
        entityType: STELLAR_ESCROW_ENTITY,
        entityId: escrowId,
        reason: `Reconciled against the chain: payout ${settlementAttemptHash} had already landed`,
        before: { status: StellarEscrowStatus.SETTLING },
        after: { status: StellarEscrowStatus.SETTLED, transactionHash: settlementAttemptHash },
        correlationId: escrowId,
      });
      return {
        escrowId,
        settled: true,
        transactionHash: settlementAttemptHash,
        blockedBy: null,
      };
    }

    const expiresAt = stellarEscrow.settlementAttemptExpiresAt;
    const stillLive = !outcome && (!expiresAt || expiresAt.getTime() > Date.now());
    if (stillLive) {
      return this.blocked(
        escrowId,
        `Payout ${settlementAttemptHash} is still in flight and cannot be retried yet`,
        actorId,
      );
    }

    const released = await this.stellarEscrows.update(
      { id: stellarEscrow.id, status: StellarEscrowStatus.SETTLING, settlementAttemptHash },
      {
        status: StellarEscrowStatus.FUNDED,
        settlementAttemptHash: null,
        settlementAttemptExpiresAt: null,
      },
    );
    if (released.affected !== 1) {
      return this.blocked(
        escrowId,
        'Another settlement run already reconciled this payout',
        actorId,
      );
    }

    await this.auditService.record({
      actorId,
      action: STELLAR_AUDIT_ACTIONS.SETTLEMENT_RECONCILED,
      entityType: STELLAR_ESCROW_ENTITY,
      entityId: escrowId,
      reason: outcome
        ? `Payout ${settlementAttemptHash} failed on-chain and never moved funds`
        : `Payout ${settlementAttemptHash} expired without being applied`,
      before: { status: StellarEscrowStatus.SETTLING, settlementAttemptHash },
      after: { status: StellarEscrowStatus.FUNDED, settlementAttemptHash: null },
      correlationId: escrowId,
    });

    stellarEscrow.status = StellarEscrowStatus.FUNDED;
    stellarEscrow.settlementAttemptHash = null;
    stellarEscrow.settlementAttemptExpiresAt = null;
    return null;
  }

  private async resolvePayout(stellarEscrow: StellarEscrow): Promise<StellarPayout | string> {
    const { escrow, terms, parties } = await this.escrowService.getDetail(stellarEscrow.escrowId);
    if (!terms) {
      return 'Escrow terms not found';
    }

    const released = escrow.state === EscrowState.RELEASED;
    const role = released ? EscrowRole.SELLER : EscrowRole.BUYER;
    const recipient = parties.find((party) => party.role === role);
    if (!recipient) {
      return `No ${role} on the escrow`;
    }

    try {
      const account = await this.walletService.findOrThrow(recipient.userId);
      const price = Money.of(terms.priceAmount, terms.priceCurrency);
      const payable = released ? computeFeeSplit(price, terms.feeBps).netAmount : price;

      return {
        recipientUserId: recipient.userId,
        destinationAccountId: account.accountId,
        amount: toStellarAmount(payable),
      };
    } catch (error) {
      if (error instanceof StellarAccountNotLinkedError) {
        return error.message;
      }
      throw error;
    }
  }

  private async claim(stellarEscrow: StellarEscrow): Promise<boolean> {
    const claimed = await this.stellarEscrows.update(
      { id: stellarEscrow.id, status: StellarEscrowStatus.FUNDED },
      { status: StellarEscrowStatus.SETTLING },
    );
    return claimed.affected === 1;
  }

  private async release(stellarEscrow: StellarEscrow): Promise<void> {
    await this.stellarEscrows.update(
      { id: stellarEscrow.id, status: StellarEscrowStatus.SETTLING },
      { status: StellarEscrowStatus.FUNDED },
    );
  }

  private async markSettled(id: string, transactionHash: string): Promise<void> {
    await this.stellarEscrows.update(
      { id },
      {
        status: StellarEscrowStatus.SETTLED,
        settlementTransactionHash: transactionHash,
        settlementAttemptHash: null,
        settlementAttemptExpiresAt: null,
      },
    );
  }

  private async uncertain(
    stellarEscrow: StellarEscrow,
    transactionHash: string,
    actorId: string | null,
    error: unknown,
  ): Promise<StellarSettlementOutcome> {
    const { escrowId } = stellarEscrow;
    const reason = `The payout submission failed without a confirmed result; payout ${transactionHash} will be reconciled against the chain before any retry`;

    this.logger.error(
      `Stellar settlement for escrow ${escrowId} is in doubt: ${String(error)}. ` +
        `Payout ${transactionHash} is recorded and the next sweep will resolve it against the chain.`,
    );

    await this.auditService.record({
      actorId,
      action: STELLAR_AUDIT_ACTIONS.SETTLEMENT_UNCERTAIN,
      entityType: STELLAR_ESCROW_ENTITY,
      entityId: escrowId,
      reason,
      before: { status: StellarEscrowStatus.FUNDED },
      after: {
        status: StellarEscrowStatus.SETTLING,
        settlementAttemptHash: transactionHash,
        error: String(error),
      },
      correlationId: escrowId,
    });

    return { escrowId, settled: false, transactionHash: null, blockedBy: reason };
  }

  private async blocked(
    escrowId: string,
    reason: string,
    actorId: string | null,
  ): Promise<StellarSettlementOutcome> {
    this.logger.warn(`Stellar settlement for escrow ${escrowId} is blocked: ${reason}`);

    await this.auditService.record({
      actorId,
      action: STELLAR_AUDIT_ACTIONS.SETTLEMENT_BLOCKED,
      entityType: STELLAR_ESCROW_ENTITY,
      entityId: escrowId,
      reason,
      correlationId: escrowId,
    });

    return { escrowId, settled: false, transactionHash: null, blockedBy: reason };
  }
}
