import { normalizeFlutterwaveWebhook, normalizePaystackWebhook } from './webhook-event';

describe('normalizePaystackWebhook', () => {
  it('treats charge.success as a succeeded charge in minor units', () => {
    const event = normalizePaystackWebhook({
      event: 'charge.success',
      data: {
        id: 42,
        reference: 'ref-1',
        amount: 1_500_000,
        currency: 'NGN',
        status: 'success',
      },
    });

    expect(event).toEqual({
      provider: 'paystack',
      eventId: '42',
      kind: 'charge',
      reference: 'ref-1',
      amount: 1_500_000,
      currency: 'NGN',
      succeeded: true,
    });
  });

  it('routes transfer events and carries their outcome', () => {
    const failed = normalizePaystackWebhook({
      event: 'transfer.failed',
      data: { id: 7, reference: 'payout-1', amount: 5000, currency: 'NGN', status: 'failed' },
    });

    expect(failed.kind).toBe('transfer');
    expect(failed.succeeded).toBe(false);

    const succeeded = normalizePaystackWebhook({
      event: 'transfer.success',
      data: { id: 8, reference: 'payout-2', amount: 5000, currency: 'NGN', status: 'success' },
    });

    expect(succeeded.kind).toBe('transfer');
    expect(succeeded.succeeded).toBe(true);
  });

  it('classifies any other event as one to record and ignore', () => {
    const event = normalizePaystackWebhook({
      event: 'charge.failed',
      data: { id: 9, reference: 'ref-2', amount: 100, currency: 'NGN', status: 'failed' },
    });

    expect(event.kind).toBe('other');
  });
});

describe('normalizeFlutterwaveWebhook', () => {
  it('converts major-unit amounts to minor units without floating point arithmetic', () => {
    const event = normalizeFlutterwaveWebhook({
      event: 'charge.completed',
      data: {
        id: 1234,
        tx_ref: 'ref-1',
        amount: 15000.99,
        currency: 'NGN',
        status: 'successful',
      },
    });

    expect(event).toEqual({
      provider: 'flutterwave',
      eventId: '1234',
      kind: 'charge',
      reference: 'ref-1',
      amount: 1_500_099,
      currency: 'NGN',
      succeeded: true,
    });
  });

  it('accepts a string amount', () => {
    const event = normalizeFlutterwaveWebhook({
      event: 'charge.completed',
      data: { id: 1, tx_ref: 'ref-1', amount: '0.05', currency: 'NGN', status: 'successful' },
    });

    expect(event.amount).toBe(5);
  });

  it('reports an unparseable amount as unknown rather than guessing', () => {
    const event = normalizeFlutterwaveWebhook({
      event: 'charge.completed',
      data: { id: 1, tx_ref: 'ref-1', amount: '1.2345', currency: 'NGN', status: 'successful' },
    });

    expect(event.amount).toBeNull();
  });

  it('marks a non-successful charge as not succeeded', () => {
    const event = normalizeFlutterwaveWebhook({
      event: 'charge.completed',
      data: { id: 2, tx_ref: 'ref-2', amount: 100, currency: 'NGN', status: 'failed' },
    });

    expect(event.kind).toBe('charge');
    expect(event.succeeded).toBe(false);
  });

  it('takes the merchant reference from reference on transfer events', () => {
    const event = normalizeFlutterwaveWebhook({
      event: 'transfer.completed',
      data: { id: 3, reference: 'payout-1', amount: 250, currency: 'NGN', status: 'SUCCESSFUL' },
    });

    expect(event.kind).toBe('transfer');
    expect(event.reference).toBe('payout-1');
    expect(event.amount).toBe(25_000);
    expect(event.succeeded).toBe(true);
  });
});
