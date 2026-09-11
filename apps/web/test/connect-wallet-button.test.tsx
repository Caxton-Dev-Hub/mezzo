import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectWalletButton } from '../components/stellar/connect-wallet-button';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';

const ACCOUNT_ID = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';

const getStellarWallet = vi.fn();
const linkStellarWallet = vi.fn();
const unlinkStellarWallet = vi.fn();

vi.mock('../lib/stellar-client', () => ({
  getStellarWallet: () => getStellarWallet(),
  linkStellarWallet: (accountId: string) => linkStellarWallet(accountId),
  unlinkStellarWallet: () => unlinkStellarWallet(),
}));

function authenticate() {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'user-1', email: 'buyer@example.com', role: 'USER' },
  } as never);
}

describe('ConnectWalletButton', () => {
  beforeEach(() => {
    getStellarWallet.mockReset().mockResolvedValue(null);
    linkStellarWallet.mockReset().mockResolvedValue({
      accountId: ACCOUNT_ID,
      network: 'testnet',
      linkedAt: new Date(),
    });
    unlinkStellarWallet.mockReset().mockResolvedValue(undefined);
    authenticate();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('shows a Stellar coming-soon badge when the rail is not live', () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', '');

    renderWithProviders(<ConnectWalletButton />);

    expect(screen.getByTestId('stellar-coming-soon')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(getStellarWallet).not.toHaveBeenCalled();
  });

  it('labels the badge with the Stellar mark', () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', '');

    renderWithProviders(<ConnectWalletButton />);

    expect(screen.getByRole('img', { name: 'Stellar' })).toBeInTheDocument();
  });

  it('connects the browser wallet and links the account in dev mode', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');
    vi.stubGlobal('freighterApi', undefined);
    Object.defineProperty(window, 'freighterApi', {
      configurable: true,
      value: { requestAccess: vi.fn().mockResolvedValue({ address: ACCOUNT_ID }) },
    });

    renderWithProviders(<ConnectWalletButton />);

    await userEvent.click(await screen.findByRole('button', { name: /connect wallet/i }));

    await waitFor(() => expect(linkStellarWallet).toHaveBeenCalledWith(ACCOUNT_ID));
  });

  it('points at Freighter when no wallet extension is present', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');
    Object.defineProperty(window, 'freighterApi', { configurable: true, value: undefined });

    renderWithProviders(<ConnectWalletButton />);

    await userEvent.click(await screen.findByRole('button', { name: /connect wallet/i }));

    expect(await screen.findByText(/install freighter/i)).toBeInTheDocument();
  });

  it('shows the linked account, shortened, once a wallet is connected', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');
    getStellarWallet.mockResolvedValue({
      accountId: ACCOUNT_ID,
      network: 'testnet',
      linkedAt: new Date(),
    });

    renderWithProviders(<ConnectWalletButton />);

    expect(await screen.findByText('GABC…STUV')).toBeInTheDocument();
  });

  it('disconnects the linked wallet when clicked', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');
    getStellarWallet.mockResolvedValue({
      accountId: ACCOUNT_ID,
      network: 'testnet',
      linkedAt: new Date(),
    });

    renderWithProviders(<ConnectWalletButton />);

    await userEvent.click(await screen.findByRole('button', { name: /GABC…STUV/ }));

    await waitFor(() => expect(unlinkStellarWallet).toHaveBeenCalled());
  });
});
