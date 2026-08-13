import { Between, Repository } from 'typeorm';
import { PaymentsReconciliationService } from './payments-reconciliation.service';
import { PaymentIntentStatus } from './entities/payment-intent-status.enum';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { PaymentProvider, ProviderTransaction } from './providers/payment-provider.interface';

const WINDOW = { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-02-01T00:00:00.000Z') };

function buildTransaction(overrides: Partial<ProviderTransaction> = {}): ProviderTransaction {
  return {
    reference: 'ref-1',
    amountKobo: 100_000,
    currency: 'NGN',
    status: 'success',
    paidAt: new Date('2026-01-15T00:00:00.000Z'),
    ...overrides,
  };
}

function buildIntent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: 'intent-1',
    escrowId: 'escrow-1',
    buyerId: 'buyer-1',
    amount: 100_000,
    currency: 'NGN',
    provider: 'paystack',
    providerReference: 'ref-1',
    status: PaymentIntentStatus.FUNDED,
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    updatedAt: new Date('2026-01-10T00:00:00.000Z'),
    ...overrides,
  } as PaymentIntent;
}

interface Harness {
  service: PaymentsReconciliationService;
  intentsFind: jest.Mock;
  listTransactions: jest.Mock;
}

function buildHarness(transactions: ProviderTransaction[], intents: PaymentIntent[]): Harness {
  const intentsFind = jest.fn().mockResolvedValue(intents);
  const repository = { find: intentsFind } as unknown as Repository<PaymentIntent>;

  const listTransactions = jest.fn().mockResolvedValue(transactions);
  const paymentProvider = {
    name: 'paystack',
    listTransactions,
    initializeTransaction: jest.fn(),
    initiateTransfer: jest.fn(),
  } as unknown as PaymentProvider;

  return {
    service: new PaymentsReconciliationService(repository, paymentProvider),
    intentsFind,
    listTransactions,
  };
}

describe('PaymentsReconciliationService.reconcile', () => {
  it('reports nothing wrong when every successful charge matches an intent', async () => {
    const harness = buildHarness([buildTransaction()], [buildIntent()]);

    await expect(harness.service.reconcile(WINDOW)).resolves.toEqual({
      orphanProviderReferences: [],
      unmatchedFundedIntentIds: [],
    });
  });

  it('flags a provider charge that Mezzo has no intent for', async () => {
    const harness = buildHarness([buildTransaction({ reference: 'ghost-ref' })], []);

    const report = await harness.service.reconcile(WINDOW);

    expect(report.orphanProviderReferences).toEqual(['ghost-ref']);
  });

  it('flags an intent marked funded that the provider never charged', async () => {
    const harness = buildHarness([], [buildIntent({ id: 'phantom' })]);

    const report = await harness.service.reconcile(WINDOW);

    expect(report.unmatchedFundedIntentIds).toEqual(['phantom']);
  });

  it('ignores failed and abandoned provider transactions entirely', async () => {
    const harness = buildHarness(
      [
        buildTransaction({ reference: 'failed-ref', status: 'failed' }),
        buildTransaction({ reference: 'abandoned-ref', status: 'abandoned' }),
      ],
      [],
    );

    const report = await harness.service.reconcile(WINDOW);

    expect(report.orphanProviderReferences).toEqual([]);
  });

  it('treats a funded intent whose only charge failed as unmatched', async () => {
    const harness = buildHarness(
      [buildTransaction({ status: 'failed' })],
      [buildIntent({ id: 'intent-1' })],
    );

    const report = await harness.service.reconcile(WINDOW);

    expect(report.unmatchedFundedIntentIds).toEqual(['intent-1']);
  });

  it('does not flag pending intents that were never charged', async () => {
    const harness = buildHarness([], [buildIntent({ status: PaymentIntentStatus.PENDING })]);

    const report = await harness.service.reconcile(WINDOW);

    expect(report.unmatchedFundedIntentIds).toEqual([]);
  });

  it('does not flag quarantined intents as unmatched', async () => {
    const harness = buildHarness([], [buildIntent({ status: PaymentIntentStatus.QUARANTINED })]);

    const report = await harness.service.reconcile(WINDOW);

    expect(report.unmatchedFundedIntentIds).toEqual([]);
  });

  it('reports both sides of a drift in one pass', async () => {
    const harness = buildHarness(
      [buildTransaction({ reference: 'orphan' })],
      [buildIntent({ id: 'phantom', providerReference: 'never-charged' })],
    );

    await expect(harness.service.reconcile(WINDOW)).resolves.toEqual({
      orphanProviderReferences: ['orphan'],
      unmatchedFundedIntentIds: ['phantom'],
    });
  });

  it('queries the provider and the intents over the same window', async () => {
    const harness = buildHarness([], []);

    await harness.service.reconcile(WINDOW);

    expect(harness.listTransactions).toHaveBeenCalledWith(WINDOW);
    expect(harness.intentsFind).toHaveBeenCalledWith({
      where: { createdAt: Between(WINDOW.from, WINDOW.to) },
    });
  });
});
