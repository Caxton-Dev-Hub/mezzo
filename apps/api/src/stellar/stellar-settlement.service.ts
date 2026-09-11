import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StellarEscrow } from '../database/entities/stellar-escrow.entity';
import { Escrow } from '../database/entities/escrow.entity';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { computeFeeSplit } from '../escrow/fee-split';
import { Money } from '../common/money/money';
import { StellarEscrowStatus } from './entities/stellar-escrow-status.enum';
import { StellarConfigService } from './stellar-config.service';
import { StellarWalletService } from './stellar-wallet.service';
import { toStellarAmount } from './stellar-amount';
import { STELLAR_NETWORK, StellarNetworkClient } from './providers/stellar-network.interface';
import { StellarAccountNotLinkedError } from './errors/stellar-account-not-linked.error';

const SETTLEABLE_STATES: readonly EscrowState[] = [EscrowState.RELEASED, EscrowState.REFUNDED];

export interface StellarSettlementOutcome {
  escrowId: string;
  settled: boolean;
  transactionHash: string | null;
  blockedBy: string | null;
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
  ) {}

  async settleDue(): Promise<StellarSettlementOutcome[]> {
    this.stellarConfig.assertEnabled();

    const due = await this.stellarEscrows
      .createQueryBuilder('stellarEscrow')
      .innerJoin(Escrow, 'escrow', 'escrow.id = stellarEscrow.escrow_id')
      .where('stellarEscrow.status = :status', { status: StellarEscrowStatus.FUNDED })
      .andWhere('escrow.state IN (:...states)', { states: SETTLEABLE_STATES })
      .orderBy('stellarEscrow.created_at', 'ASC')
      .getMany();

    const outcomes: StellarSettlementOutcome[] = [];
    for (const stellarEscrow of due) {
      outcomes.push(await this.settleOne(stellarEscrow));
    }
    return outcomes;
  }

  private async settleOne(stellarEscrow: StellarEscrow): Promise<StellarSettlementOutcome> {
    const { escrowId } = stellarEscrow;

    try {
      const { escrow, terms, parties } = await this.escrowService.getDetail(escrowId);
      if (!terms) {
        return this.blocked(escrowId, 'Escrow terms not found');
      }

      const released = escrow.state === EscrowState.RELEASED;
      const role = released ? EscrowRole.SELLER : EscrowRole.BUYER;
      const recipient = parties.find((party) => party.role === role);
      if (!recipient) {
        return this.blocked(escrowId, `No ${role} on the escrow`);
      }

      const account = await this.walletService.findOrThrow(recipient.userId);

      const price = Money.of(terms.priceAmount, terms.priceCurrency);
      const payable = released ? computeFeeSplit(price, terms.feeBps).netAmount : price;

      const transactionHash = await this.network.sendPayment({
        from: stellarEscrow.depositAccountId,
        to: account.accountId,
        amount: toStellarAmount(payable),
        memo: stellarEscrow.memo,
      });

      stellarEscrow.status = StellarEscrowStatus.SETTLED;
      stellarEscrow.settlementTransactionHash = transactionHash;
      await this.stellarEscrows.save(stellarEscrow);

      return { escrowId, settled: true, transactionHash, blockedBy: null };
    } catch (error) {
      if (error instanceof StellarAccountNotLinkedError) {
        return this.blocked(escrowId, error.message);
      }
      throw error;
    }
  }

  private blocked(escrowId: string, reason: string): StellarSettlementOutcome {
    this.logger.warn(`Stellar settlement for escrow ${escrowId} is blocked: ${reason}`);
    return { escrowId, settled: false, transactionHash: null, blockedBy: reason };
  }
}
