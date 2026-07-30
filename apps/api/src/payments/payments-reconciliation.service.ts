import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { PaymentIntentStatus } from './entities/payment-intent-status.enum';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
  TransactionWindow,
} from './providers/payment-provider.interface';

export interface FundingReconciliationReport {
  orphanProviderReferences: string[];
  unmatchedFundedIntentIds: string[];
}

@Injectable()
export class PaymentsReconciliationService {
  constructor(
    @InjectRepository(PaymentIntent)
    private readonly intents: Repository<PaymentIntent>,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  async reconcile(window: TransactionWindow): Promise<FundingReconciliationReport> {
    const transactions = await this.paymentProvider.listTransactions(window);
    const successfulTransactions = transactions.filter((transaction) => transaction.status === 'success');
    const transactionsByReference = new Map(
      successfulTransactions.map((transaction) => [transaction.reference, transaction]),
    );

    const intents = await this.intents.find({
      where: { createdAt: Between(window.from, window.to) },
    });
    const intentsByReference = new Map(intents.map((intent) => [intent.providerReference, intent]));

    const orphanProviderReferences = successfulTransactions
      .filter((transaction) => !intentsByReference.has(transaction.reference))
      .map((transaction) => transaction.reference);

    const unmatchedFundedIntentIds = intents
      .filter(
        (intent) =>
          intent.status === PaymentIntentStatus.FUNDED &&
          !transactionsByReference.has(intent.providerReference),
      )
      .map((intent) => intent.id);

    return { orphanProviderReferences, unmatchedFundedIntentIds };
  }
}
