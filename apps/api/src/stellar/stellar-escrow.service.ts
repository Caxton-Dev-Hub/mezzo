import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StellarEscrow } from '../database/entities/stellar-escrow.entity';
import { AuditService } from '../audit/audit.service';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowStateMachine } from '../escrow/escrow-state-machine';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { OnlyBuyerMayActError } from '../escrow/errors/only-buyer-may-act.error';
import { LedgerService } from '../ledger/ledger.service';
import { escrowHoldingRef, providerClearingRef } from '../ledger/account-refs';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { Money } from '../common/money/money';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/entities/notification-event-type.enum';
import { StellarEscrowStatus } from './entities/stellar-escrow-status.enum';
import { StellarConfigService } from './stellar-config.service';
import { STELLAR_LEDGER_PROVIDER } from './stellar-ledger-provider.constant';
import { toStellarAmount } from './stellar-amount';
import { STELLAR_AUDIT_ACTIONS, STELLAR_ESCROW_ENTITY } from './stellar-audit-actions';
import {
  isSimulated,
  STELLAR_NETWORK,
  StellarNetworkClient,
  StellarPayment,
} from './providers/stellar-network.interface';
import { StellarFundingUnavailableError } from './errors/stellar-funding-unavailable.error';
import { StellarDepositNotFoundError } from './errors/stellar-deposit-not-found.error';
import {
  StellarDepositMismatchError,
  StellarDepositMismatchReason,
} from './errors/stellar-deposit-mismatch.error';
import { StellarSimulationUnavailableError } from './errors/stellar-simulation-unavailable.error';
import { UnsupportedStellarCurrencyError } from './errors/unsupported-stellar-currency.error';

@Injectable()
export class StellarEscrowService {
  constructor(
    @InjectRepository(StellarEscrow)
    private readonly stellarEscrows: Repository<StellarEscrow>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(STELLAR_NETWORK)
    private readonly network: StellarNetworkClient,
    private readonly stellarConfig: StellarConfigService,
    private readonly escrowService: EscrowService,
    private readonly stateMachine: EscrowStateMachine,
    private readonly ledgerService: LedgerService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async openFunding(escrowId: string, actorId: string): Promise<StellarEscrow> {
    this.stellarConfig.assertEnabled();

    const { escrow, terms, parties } = await this.escrowService.getDetail(escrowId);
    const buyer = parties.find((party) => party.role === EscrowRole.BUYER);
    if (!buyer || buyer.userId !== actorId) {
      throw new OnlyBuyerMayActError('fund the escrow on Stellar');
    }
    if (!terms) {
      throw new NotFoundException('Escrow terms not found');
    }
    if (terms.priceCurrency !== 'USD') {
      throw new UnsupportedStellarCurrencyError(terms.priceCurrency);
    }

    const existing = await this.stellarEscrows.findOne({ where: { escrowId } });
    if (existing) {
      return existing;
    }

    if (escrow.state !== EscrowState.AGREED) {
      throw new StellarFundingUnavailableError(escrow.state);
    }

    const address = await this.network.openDepositAddress(escrowId);

    const opened = await this.stellarEscrows.save(
      this.stellarEscrows.create({
        escrowId,
        network: this.network.name,
        depositAccountId: address.accountId,
        memo: address.memo,
        assetCode: this.network.asset.code,
        assetIssuer: this.network.asset.issuer,
        expectedAmount: terms.priceAmount,
        expectedCurrency: terms.priceCurrency,
        status: StellarEscrowStatus.AWAITING_DEPOSIT,
      }),
    );

    await this.auditService.record({
      actorId,
      action: STELLAR_AUDIT_ACTIONS.FUNDING_OPENED,
      entityType: STELLAR_ESCROW_ENTITY,
      entityId: escrowId,
      reason: `Opened a ${opened.assetCode} deposit on ${opened.network}`,
      after: {
        depositAccountId: opened.depositAccountId,
        memo: opened.memo,
        assetCode: opened.assetCode,
        assetIssuer: opened.assetIssuer,
        expectedAmount: opened.expectedAmount,
        expectedCurrency: opened.expectedCurrency,
      },
      correlationId: escrowId,
    });

    return opened;
  }

  async get(escrowId: string, actorId: string): Promise<StellarEscrow> {
    await this.escrowService.assertIsParty(escrowId, actorId);
    return this.getOrThrow(escrowId);
  }

  async confirmDeposit(
    escrowId: string,
    actorId: string,
    transactionHash: string,
  ): Promise<StellarEscrow> {
    this.stellarConfig.assertEnabled();
    await this.escrowService.assertIsParty(escrowId, actorId);

    const stellarEscrow = await this.getOrThrow(escrowId);
    if (stellarEscrow.fundingTransactionHash === transactionHash) {
      return stellarEscrow;
    }
    if (stellarEscrow.status !== StellarEscrowStatus.AWAITING_DEPOSIT) {
      await this.auditService.record({
        actorId,
        action: STELLAR_AUDIT_ACTIONS.DEPOSIT_REJECTED,
        entityType: STELLAR_ESCROW_ENTITY,
        entityId: escrowId,
        reason: 'Deposit rejected: ALREADY_APPLIED — the escrow is already funded',
        before: {
          status: stellarEscrow.status,
          fundingTransactionHash: stellarEscrow.fundingTransactionHash,
        },
        after: { transactionHash },
        correlationId: escrowId,
      });
      throw new StellarDepositMismatchError('ALREADY_APPLIED', transactionHash);
    }

    const payment = await this.network.findPayment(transactionHash);
    if (!payment) {
      throw new StellarDepositNotFoundError(transactionHash);
    }
    await this.assertPaymentFunds(stellarEscrow, payment, actorId);

    const funded = Money.of(stellarEscrow.expectedAmount, stellarEscrow.expectedCurrency);

    await this.dataSource.transaction(async (manager) => {
      await this.ledgerService.postTransaction(
        [
          {
            accountRef: providerClearingRef(STELLAR_LEDGER_PROVIDER, funded.currency),
            direction: EntryDirection.DEBIT,
            money: funded,
          },
          {
            accountRef: escrowHoldingRef(escrowId),
            direction: EntryDirection.CREDIT,
            money: funded,
          },
        ],
        { idempotencyKey: `stellar-fund:${transactionHash}`, correlationId: escrowId },
        manager,
      );

      await this.stateMachine.transition(
        escrowId,
        EscrowState.FUNDED,
        {
          actorId: null,
          reason: `Stellar deposit ${transactionHash} verified`,
          correlationId: escrowId,
        },
        manager,
      );

      stellarEscrow.status = StellarEscrowStatus.FUNDED;
      stellarEscrow.fundingTransactionHash = transactionHash;
      await manager.save(StellarEscrow, stellarEscrow);

      await this.auditService.record(
        {
          actorId,
          action: STELLAR_AUDIT_ACTIONS.DEPOSIT_CONFIRMED,
          entityType: STELLAR_ESCROW_ENTITY,
          entityId: escrowId,
          reason: `Verified ${payment.amount} ${payment.asset.code} from ${payment.from}`,
          before: { status: StellarEscrowStatus.AWAITING_DEPOSIT },
          after: {
            status: StellarEscrowStatus.FUNDED,
            transactionHash,
            from: payment.from,
            amount: payment.amount,
            assetCode: payment.asset.code,
            assetIssuer: payment.asset.issuer,
            creditedAmount: funded.amount,
            creditedCurrency: funded.currency,
          },
          correlationId: escrowId,
        },
        manager,
      );
    });

    const { escrow, parties } = await this.escrowService.getDetail(escrowId);
    await this.notificationsService.notify({
      escrowId,
      sourceEventId: `${escrowId}_${escrow.state}_${escrow.version}`,
      eventType: NotificationEventType.FUNDED,
      recipientUserIds: parties.map((party) => party.userId),
    });

    return stellarEscrow;
  }

  async simulateDeposit(escrowId: string, actorId: string): Promise<StellarEscrow> {
    if (!isSimulated(this.network)) {
      throw new StellarSimulationUnavailableError();
    }

    const stellarEscrow = await this.get(escrowId, actorId);
    const payment = await this.network.receivePayment({
      from: stellarEscrow.depositAccountId,
      to: stellarEscrow.depositAccountId,
      amount: toStellarAmount(
        Money.of(stellarEscrow.expectedAmount, stellarEscrow.expectedCurrency),
      ),
      memo: stellarEscrow.memo,
    });

    return this.confirmDeposit(escrowId, actorId, payment.transactionHash);
  }

  async getOrThrow(escrowId: string): Promise<StellarEscrow> {
    const stellarEscrow = await this.stellarEscrows.findOne({ where: { escrowId } });
    if (!stellarEscrow) {
      throw new NotFoundException('This escrow has no Stellar deposit');
    }
    return stellarEscrow;
  }

  private async assertPaymentFunds(
    stellarEscrow: StellarEscrow,
    payment: StellarPayment,
    actorId: string,
  ): Promise<void> {
    const expected = toStellarAmount(
      Money.of(stellarEscrow.expectedAmount, stellarEscrow.expectedCurrency),
    );

    const mismatch = this.findMismatch(stellarEscrow, payment, expected);
    if (!mismatch) {
      return;
    }

    await this.auditService.record({
      actorId,
      action: STELLAR_AUDIT_ACTIONS.DEPOSIT_REJECTED,
      entityType: STELLAR_ESCROW_ENTITY,
      entityId: stellarEscrow.escrowId,
      reason: `Deposit rejected: ${mismatch} did not match the escrow`,
      before: {
        depositAccountId: stellarEscrow.depositAccountId,
        memo: stellarEscrow.memo,
        assetCode: stellarEscrow.assetCode,
        assetIssuer: stellarEscrow.assetIssuer,
        expectedAmount: expected,
      },
      after: {
        transactionHash: payment.transactionHash,
        from: payment.from,
        to: payment.to,
        memo: payment.memo,
        assetCode: payment.asset.code,
        assetIssuer: payment.asset.issuer,
        amount: payment.amount,
      },
      correlationId: stellarEscrow.escrowId,
    });

    throw new StellarDepositMismatchError(mismatch, payment.transactionHash);
  }

  private findMismatch(
    stellarEscrow: StellarEscrow,
    payment: StellarPayment,
    expected: string,
  ): StellarDepositMismatchReason | null {
    if (payment.to !== stellarEscrow.depositAccountId) {
      return 'DESTINATION';
    }
    if (payment.memo !== stellarEscrow.memo) {
      return 'MEMO';
    }
    if (
      payment.asset.code !== stellarEscrow.assetCode ||
      payment.asset.issuer !== stellarEscrow.assetIssuer
    ) {
      return 'ASSET';
    }
    if (payment.amount !== expected) {
      return 'AMOUNT';
    }
    return null;
  }
}
