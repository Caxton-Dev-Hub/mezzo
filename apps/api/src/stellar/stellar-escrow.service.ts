import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StellarEscrow } from '../database/entities/stellar-escrow.entity';
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
import {
  isSimulated,
  STELLAR_NETWORK,
  StellarNetworkClient,
  StellarPayment,
} from './providers/stellar-network.interface';
import { StellarFundingUnavailableError } from './errors/stellar-funding-unavailable.error';
import { StellarDepositNotFoundError } from './errors/stellar-deposit-not-found.error';
import { StellarDepositMismatchError } from './errors/stellar-deposit-mismatch.error';
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

    return this.stellarEscrows.save(
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
      throw new StellarDepositMismatchError('ALREADY_APPLIED', transactionHash);
    }

    const payment = await this.network.findPayment(transactionHash);
    if (!payment) {
      throw new StellarDepositNotFoundError(transactionHash);
    }
    this.assertPaymentFunds(stellarEscrow, payment);

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

  private assertPaymentFunds(stellarEscrow: StellarEscrow, payment: StellarPayment): void {
    if (payment.to !== stellarEscrow.depositAccountId) {
      throw new StellarDepositMismatchError('DESTINATION', payment.transactionHash);
    }
    if (payment.memo !== stellarEscrow.memo) {
      throw new StellarDepositMismatchError('MEMO', payment.transactionHash);
    }
    if (
      payment.asset.code !== stellarEscrow.assetCode ||
      payment.asset.issuer !== stellarEscrow.assetIssuer
    ) {
      throw new StellarDepositMismatchError('ASSET', payment.transactionHash);
    }

    const expected = toStellarAmount(
      Money.of(stellarEscrow.expectedAmount, stellarEscrow.expectedCurrency),
    );
    if (payment.amount !== expected) {
      throw new StellarDepositMismatchError('AMOUNT', payment.transactionHash);
    }
  }
}
