import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StellarFundingPanel } from '../components/stellar/stellar-funding-panel';
import { renderWithProviders } from './render-with-providers';
import { ApiError } from '../lib/api-error';

const CUSTODY = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';
const ISSUER = 'GZYXWVUTSRQPONMLKJIHGFEDCBA765432ZYXWVUTSRQPONMLKJIHGFED';
const HASH = 'a'.repeat(64);
const MEMO = '4229f61e63d5490f801c753dfe38';

const getStellarRailConfig = vi.fn();
const getStellarEscrow = vi.fn();
const openStellarFunding = vi.fn();
const confirmStellarDeposit = vi.fn();
const simulateStellarDeposit = vi.fn();

vi.mock('../lib/stellar-client', () => ({
  getStellarRailConfig: () => getStellarRailConfig(),
  getStellarWallet: vi.fn().mockResolvedValue(null),
  requestStellarLinkChallenge: vi.fn(),
  linkStellarWallet: vi.fn(),
  unlinkStellarWallet: vi.fn(),
  getStellarEscrow: (escrowId: string) => getStellarEscrow(escrowId),
  openStellarFunding: (escrowId: string) => openStellarFunding(escrowId),
  confirmStellarDeposit: (escrowId: string, dto: unknown) => confirmStellarDeposit(escrowId, dto),
  simulateStellarDeposit: (escrowId: string) => simulateStellarDeposit(escrowId),
}));

type PanelEscrow = Parameters<typeof StellarFundingPanel>[0]['escrow'];

function escrowPricedIn(currency: 'USD' | 'NGN'): PanelEscrow {
  return {
    id: 'escrow-1',
    state: 'AGREED',
    parties: [],
    terms: { price: { amount: 100_000, currency } },
  } as unknown as PanelEscrow;
}

const ESCROW = escrowPricedIn('USD');

const DEPOSIT = {
  escrowId: 'escrow-1',
  status: 'AWAITING_DEPOSIT',
  network: 'testnet',
  depositAccountId: CUSTODY,
  memo: MEMO,
  asset: { code: 'USDC', issuer: ISSUER },
  expected: { amount: 100_000, currency: 'USD' },
  expectedAssetAmount: '1000.0000000',
  fundingTransactionHash: null,
  settlementTransactionHash: null,
};

function railConfig(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    simulated: false,
    network: 'testnet',
    asset: { code: 'USDC', issuer: ISSUER },
    ...overrides,
  };
}

describe('StellarFundingPanel', () => {
  beforeEach(() => {
    getStellarRailConfig.mockReset().mockResolvedValue(railConfig());
    getStellarEscrow.mockReset().mockRejectedValue(
      new ApiError({ statusCode: 404, code: 'NOT_FOUND', message: 'No Stellar deposit' }),
    );
    openStellarFunding.mockReset().mockResolvedValue(DEPOSIT);
    confirmStellarDeposit.mockReset();
    simulateStellarDeposit.mockReset();
  });

  it('renders nothing when the API reports the rail is off', async () => {
    getStellarRailConfig.mockResolvedValue(railConfig({ enabled: false, asset: null }));

    const { container } = renderWithProviders(
      <StellarFundingPanel escrow={ESCROW} isBuyer />,
    );

    await waitFor(() => expect(getStellarRailConfig).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(openStellarFunding).not.toHaveBeenCalled();
  });

  it('declines an escrow that is not priced in USD', async () => {
    renderWithProviders(<StellarFundingPanel escrow={escrowPricedIn('NGN')} isBuyer />);

    expect(await screen.findByText(/only available for escrows priced in USD/i)).toBeInTheDocument();
  });

  it('tells a non-buyer they cannot fund it', async () => {
    renderWithProviders(<StellarFundingPanel escrow={ESCROW} isBuyer={false} />);

    expect(await screen.findByText(/only the buyer can fund/i)).toBeInTheDocument();
  });

  it('shows the deposit address, memo and exact amount once funding is opened', async () => {
    renderWithProviders(<StellarFundingPanel escrow={ESCROW} isBuyer />);

    await userEvent.click(await screen.findByRole('button', { name: /deposit address/i }));

    expect(await screen.findByText(CUSTODY)).toBeInTheDocument();
    expect(screen.getByText(MEMO)).toBeInTheDocument();
    expect(screen.getByText('1000.0000000')).toBeInTheDocument();
    expect(screen.getByText(ISSUER)).toBeInTheDocument();
    expect(screen.getByText(/memo is what ties your payment/i)).toBeInTheDocument();
  });

  it('refuses to submit a transaction hash that is not 64 hex characters', async () => {
    renderWithProviders(<StellarFundingPanel escrow={ESCROW} isBuyer />);
    await userEvent.click(await screen.findByRole('button', { name: /deposit address/i }));

    await userEvent.type(await screen.findByLabelText(/paste the transaction hash/i), 'nope');

    expect(screen.getByRole('button', { name: /confirm deposit/i })).toBeDisabled();
    expect(confirmStellarDeposit).not.toHaveBeenCalled();
  });

  it('confirms a deposit and reports it as verified', async () => {
    confirmStellarDeposit.mockResolvedValue({
      ...DEPOSIT,
      status: 'FUNDED',
      fundingTransactionHash: HASH,
    });

    renderWithProviders(<StellarFundingPanel escrow={ESCROW} isBuyer />);
    await userEvent.click(await screen.findByRole('button', { name: /deposit address/i }));
    await userEvent.type(await screen.findByLabelText(/paste the transaction hash/i), HASH);
    await userEvent.click(screen.getByRole('button', { name: /confirm deposit/i }));

    await waitFor(() =>
      expect(confirmStellarDeposit).toHaveBeenCalledWith('escrow-1', { transactionHash: HASH }),
    );
    expect(await screen.findByText(/deposit verified on stellar/i)).toBeInTheDocument();
  });

  it('explains a memo mismatch in plain words rather than a code', async () => {
    confirmStellarDeposit.mockRejectedValue(
      new ApiError({
        statusCode: 422,
        code: 'STELLAR_DEPOSIT_MISMATCH',
        message: 'Stellar payment does not fund this escrow',
        details: { reason: 'MEMO' },
      }),
    );

    renderWithProviders(<StellarFundingPanel escrow={ESCROW} isBuyer />);
    await userEvent.click(await screen.findByRole('button', { name: /deposit address/i }));
    await userEvent.type(await screen.findByLabelText(/paste the transaction hash/i), HASH);
    await userEvent.click(screen.getByRole('button', { name: /confirm deposit/i }));

    expect(await screen.findByText(/missing this escrow.s memo/i)).toBeInTheDocument();
  });

  it('offers the simulate shortcut only when the server says the network is simulated', async () => {
    renderWithProviders(<StellarFundingPanel escrow={ESCROW} isBuyer />);
    await userEvent.click(await screen.findByRole('button', { name: /deposit address/i }));

    expect(screen.queryByText(/simulate the deposit/i)).not.toBeInTheDocument();
  });

  it('simulates a deposit when the server runs a simulated network', async () => {
    getStellarRailConfig.mockResolvedValue(railConfig({ simulated: true }));
    simulateStellarDeposit.mockResolvedValue({
      ...DEPOSIT,
      status: 'FUNDED',
      fundingTransactionHash: HASH,
    });

    renderWithProviders(<StellarFundingPanel escrow={ESCROW} isBuyer />);
    await userEvent.click(await screen.findByRole('button', { name: /deposit address/i }));
    await userEvent.click(await screen.findByText(/simulate the deposit/i));

    await waitFor(() => expect(simulateStellarDeposit).toHaveBeenCalledWith('escrow-1'));
    expect(await screen.findByText(/deposit verified on stellar/i)).toBeInTheDocument();
  });
});
