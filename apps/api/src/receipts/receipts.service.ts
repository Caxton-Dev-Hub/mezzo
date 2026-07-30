import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ReceiptResponse } from '@mezzo/shared-types';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { PaymentIntentStatus } from '../payments/entities/payment-intent-status.enum';
import { UsersService } from '../users/users.service';
import { ReceiptNotAvailableError } from './errors/receipt-not-available.error';
import { toReceiptResponse } from './dto/receipt-response';

const RELEASED_STATES: ReadonlySet<EscrowState> = new Set([
  EscrowState.RELEASED,
  EscrowState.RESOLVED_RELEASE,
  EscrowState.REFUNDED,
  EscrowState.RESOLVED_REFUND,
]);

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(PaymentIntent)
    private readonly paymentIntents: Repository<PaymentIntent>,
    private readonly escrowService: EscrowService,
    private readonly usersService: UsersService,
  ) {}

  async getReceipt(escrowId: string, userId: string): Promise<ReceiptResponse> {
    await this.escrowService.assertIsParty(escrowId, userId);

    const { escrow, terms, parties } = await this.escrowService.getDetail(escrowId);
    if (!terms) {
      throw new NotFoundException('Escrow terms not found');
    }

    const events = await this.escrowService.getEvents(escrowId);
    const fundedEvent = events.find((event) => event.toState === EscrowState.FUNDED);
    if (!fundedEvent) {
      throw new ReceiptNotAvailableError();
    }
    const releasedEvent = events.find((event) => RELEASED_STATES.has(event.toState));

    const buyerParty = parties.find((party) => party.role === EscrowRole.BUYER);
    const sellerParty = parties.find((party) => party.role === EscrowRole.SELLER);
    const [buyer, seller] = await Promise.all([
      buyerParty ? this.usersService.findById(buyerParty.userId) : null,
      sellerParty ? this.usersService.findById(sellerParty.userId) : null,
    ]);

    const paymentIntent = await this.paymentIntents.findOne({
      where: { escrowId, status: PaymentIntentStatus.FUNDED },
      order: { createdAt: 'DESC' },
    });

    return toReceiptResponse({
      escrow,
      terms,
      buyerEmail: buyer?.email ?? 'unknown',
      sellerEmail: seller?.email ?? 'unknown',
      fundedAt: fundedEvent.createdAt,
      releasedAt: releasedEvent?.createdAt ?? null,
      paymentReference: paymentIntent?.providerReference ?? null,
    });
  }
}
