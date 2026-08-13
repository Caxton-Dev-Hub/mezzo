import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import type {
  DisputePacketResponse,
  DisputeResponse,
  EvidenceItemResponse,
} from '@mezzo/shared-types';
import DisputeDetailPage from '../app/(app)/disputes/[id]/page';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'dispute-1' }),
}));

vi.mock('../components/evidence/evidence-capture', () => ({
  EvidenceCapture: () => <div>Evidence capture</div>,
}));

const BUYER_ID = 'buyer-id';
const SELLER_ID = 'seller-id';
const ESCROW_ID = 'escrow-1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function evidenceItem(id: string, uploaderId: string): EvidenceItemResponse {
  return {
    id,
    escrowId: ESCROW_ID,
    uploaderId,
    phase: 'AT_DELIVERY',
    contentHash: `hash-${id}`,
    declaredMime: 'image/jpeg',
    detectedMime: 'image/jpeg',
    sizeBytes: 1024,
    width: 10,
    height: 10,
    capturedAt: null,
    deviceMake: null,
    deviceModel: null,
    gpsLatitude: null,
    gpsLongitude: null,
    flags: [],
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
  };
}

function dispute(overrides: Partial<DisputeResponse> = {}): DisputeResponse {
  return {
    id: 'dispute-1',
    escrowId: ESCROW_ID,
    raisedByUserId: BUYER_ID,
    reasonCode: 'DAMAGED',
    statement: 'The lens arrived cracked.',
    state: 'EVIDENCE',
    evidenceWindowExpiresAt: new Date(Date.now() + 90 * 60 * 1000 + 5_000),
    resolvedOutcome: null,
    resolvedByUserId: null,
    resolvedAt: null,
    resolvedSellerAmount: null,
    resolvedBuyerAmount: null,
    resolvedFeeAmount: null,
    resolvedCurrency: null,
    resolvedArbitrationRecordId: null,
    createdAt: new Date('2026-07-01T09:00:00.000Z'),
    updatedAt: new Date('2026-07-01T09:00:00.000Z'),
    ...overrides,
  };
}

function packet(overrides: Partial<DisputePacketResponse> = {}): DisputePacketResponse {
  return {
    dispute: dispute(),
    frozenTerms: {
      price: { amount: 100_000, currency: 'NGN' },
      inspectionWindowHours: 48,
      deliveryMethod: 'GIG Logistics',
      itemDescription: 'A vintage camera',
      feeBps: 250,
      requiresVerification: false,
      agreementText: null,
    },
    timeline: [],
    creationEvidence: [],
    buyerEvidence: [evidenceItem('buyer-evidence-1', BUYER_ID)],
    sellerEvidence: [],
    submissionFlags: { buyerSubmitted: true, sellerSubmitted: false, evidenceWindowElapsed: false },
    chatTranscript: [],
    ...overrides,
  };
}

function stubFetch(body: DisputePacketResponse) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.includes('/disputes/')) {
        return jsonResponse(body);
      }
      return jsonResponse({
        id: ESCROW_ID,
        state: 'DISPUTED',
        version: 6,
        terms: body.frozenTerms,
        parties: [
          { userId: BUYER_ID, role: 'BUYER', termsAcceptedAt: '2026-07-01T08:00:00.000Z' },
          { userId: SELLER_ID, role: 'SELLER', termsAcceptedAt: '2026-07-01T08:05:00.000Z' },
        ],
        trackingReference: null,
        deliveredAt: '2026-07-01T08:30:00.000Z',
        createdAt: '2026-07-01T07:00:00.000Z',
        updatedAt: '2026-07-01T09:00:00.000Z',
      });
    }),
  );
}

function signIn(userId: string) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 'token',
    user: {
      id: userId,
      email: `${userId}@example.com`,
      role: 'USER',
      emailVerified: true,
      createdAt: new Date(),
    },
  });
}

describe('DisputeDetailPage', () => {
  beforeEach(() => {
    signIn(BUYER_ID);
  });

  it('shows the dispute state and a live evidence-window countdown', async () => {
    stubFetch(packet());
    renderWithProviders(<DisputeDetailPage />);

    expect(await screen.findByRole('heading', { name: 'A vintage camera' })).toBeInTheDocument();
    expect(screen.getByText(/Arrived damaged/)).toBeInTheDocument();
    expect(screen.getByText('Collecting evidence')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('status')).toHaveTextContent(/1h 3\dm left to submit/);
    expect(screen.getByText('The lens arrived cracked.')).toBeInTheDocument();
  });

  it('shows each party only their own evidence until both have submitted', async () => {
    stubFetch(packet());
    renderWithProviders(<DisputeDetailPage />);

    const own = await screen.findByRole('region', { name: 'Your evidence' });
    expect(own.querySelectorAll('button')).toHaveLength(1);

    const counterparty = screen.getByRole('region', { name: "Seller's evidence" });
    expect(counterparty).toHaveTextContent(/Visible once both parties have submitted/);
    expect(counterparty.querySelectorAll('button')).toHaveLength(0);
  });

  it('renders both parties evidence side by side once both have submitted', async () => {
    stubFetch(
      packet({
        sellerEvidence: [evidenceItem('seller-evidence-1', SELLER_ID)],
        submissionFlags: {
          buyerSubmitted: true,
          sellerSubmitted: true,
          evidenceWindowElapsed: false,
        },
      }),
    );
    renderWithProviders(<DisputeDetailPage />);

    const own = await screen.findByRole('region', { name: 'Your evidence' });
    const counterparty = screen.getByRole('region', { name: "Seller's evidence" });

    expect(own.querySelectorAll('button')).toHaveLength(1);
    expect(counterparty.querySelectorAll('button')).toHaveLength(1);
    expect(counterparty).not.toHaveTextContent(/Visible once both parties/);
  });

  it('shows non-submission neutrally once the evidence window has elapsed', async () => {
    stubFetch(
      packet({
        dispute: dispute({
          state: 'UNDER_REVIEW',
          evidenceWindowExpiresAt: new Date(Date.now() - 60_000),
        }),
        submissionFlags: {
          buyerSubmitted: true,
          sellerSubmitted: false,
          evidenceWindowElapsed: true,
        },
      }),
    );
    renderWithProviders(<DisputeDetailPage />);

    const counterparty = await screen.findByRole('region', { name: "Seller's evidence" });
    expect(counterparty).toHaveTextContent('No evidence submitted');
    expect(screen.getByRole('status')).toHaveTextContent(/Evidence window closed/);
  });

  it('gives the seller a rebuttal path while the evidence window is open', async () => {
    signIn(SELLER_ID);
    stubFetch(packet());
    renderWithProviders(<DisputeDetailPage />);

    const rebuttal = await screen.findByRole('region', { name: 'Respond to this dispute' });
    expect(rebuttal).toHaveTextContent(/shipping proof/);
    expect(screen.getByText('Evidence capture')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Your evidence' })).toBeInTheDocument();
  });

  it('offers the seller no rebuttal path once the evidence window has closed', async () => {
    signIn(SELLER_ID);
    stubFetch(
      packet({
        dispute: dispute({ state: 'UNDER_REVIEW' }),
        submissionFlags: {
          buyerSubmitted: true,
          sellerSubmitted: false,
          evidenceWindowElapsed: true,
        },
      }),
    );
    renderWithProviders(<DisputeDetailPage />);

    await screen.findByRole('heading', { name: 'A vintage camera' });
    expect(screen.queryByRole('region', { name: 'Respond to this dispute' })).not.toBeInTheDocument();
  });

  it('shows a split outcome with the viewing party wallet effect', async () => {
    stubFetch(
      packet({
        dispute: dispute({
          state: 'RESOLVED',
          resolvedOutcome: 'SPLIT',
          resolvedByUserId: 'arbiter-id',
          resolvedAt: new Date('2026-07-03T12:00:00.000Z'),
          resolvedSellerAmount: 48_750,
          resolvedBuyerAmount: 50_000,
          resolvedFeeAmount: 1_250,
          resolvedCurrency: 'NGN',
          resolvedArbitrationRecordId: 'record-1',
        }),
        submissionFlags: {
          buyerSubmitted: true,
          sellerSubmitted: true,
          evidenceWindowElapsed: true,
        },
      }),
    );
    renderWithProviders(<DisputeDetailPage />);

    await screen.findByRole('region', { name: 'Your evidence' });
    const outcome = screen.getByRole('region', { name: 'Dispute outcome' });
    expect(outcome).toHaveTextContent('Split between both parties');
    expect(outcome).toHaveTextContent('Credited to your wallet: ₦500.00');
    expect(outcome).toHaveTextContent('₦487.50');
    expect(outcome).toHaveTextContent('₦12.50');
  });

  it('never exposes the AI arbitration reasoning to a party', async () => {
    stubFetch(
      packet({
        dispute: dispute({
          state: 'RESOLVED',
          resolvedOutcome: 'REFUND_TO_BUYER',
          resolvedAt: new Date('2026-07-03T12:00:00.000Z'),
          resolvedSellerAmount: 0,
          resolvedBuyerAmount: 100_000,
          resolvedFeeAmount: 0,
          resolvedCurrency: 'NGN',
          resolvedArbitrationRecordId: 'record-1',
        }),
      }),
    );
    renderWithProviders(<DisputeDetailPage />);

    await screen.findByRole('region', { name: 'Dispute outcome' });
    expect(document.body.textContent).not.toMatch(/rationale|confidence|recommend|record-1/i);
  });

  it('surfaces a readable error when the dispute cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { statusCode: 403, code: 'NOT_ESCROW_PARTY', message: 'You are not a party to this escrow' },
          403,
        ),
      ),
    );

    renderWithProviders(<DisputeDetailPage />);

    expect(await screen.findByText('You are not a party to this escrow')).toBeInTheDocument();
  });
});
