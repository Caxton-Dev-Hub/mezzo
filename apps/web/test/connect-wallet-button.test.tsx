import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectWalletButton } from '../components/stellar/connect-wallet-button';
import { renderWithProviders } from './render-with-providers';
import { useAuthStore } from '../lib/auth-store';
import {
  WalletAccountMismatchError,
  WalletSignatureUnsupportedError,
  WalletUnavailableError,
} from '../lib/stellar-wallet';

const ACCOUNT_ID = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';
const OTHER_ACCOUNT_ID = 'GZYXWVUTSRQPONMLKJIHGFEDCBA765432ZYXWVUTSRQPONMLKJIHGFED';
const SIGNATURE = 'c2lnbmF0dXJlLWJ5dGVz';
const CHALLENGE_MESSAGE = 'localhost wants you to link this Stellar account.';

const getStellarRailConfig = vi.fn();
const getStellarWallet = vi.fn();
const requestStellarLinkChallenge = vi.fn();
const linkStellarWallet = vi.fn();
const unlinkStellarWallet = vi.fn();

const connectWallet = vi.fn();
const signWalletMessage = vi.fn();
const restoreWalletAddress = vi.fn();
const disconnectWallet = vi.fn();

vi.mock('../lib/stellar-client', () => ({
  getStellarRailConfig: () => getStellarRailConfig(),
  getStellarWallet: () => getStellarWallet(),
  requestStellarLinkChallenge: (accountId: string) => requestStellarLinkChallenge(accountId),
  linkStellarWallet: (dto: unknown) => linkStellarWallet(dto),
  unlinkStellarWallet: () => unlinkStellarWallet(),
}));

vi.mock('../lib/stellar-wallet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/stellar-wallet')>();

  return {
    ...actual,
    connectWallet: (network: string) => connectWallet(network),
    signWalletMessage: (network: string, address: string, message: string) =>
      signWalletMessage(network, address, message),
    restoreWalletAddress: (network: string) => restoreWalletAddress(network),
    disconnectWallet: () => disconnectWallet(),
  };
});

function authenticate() {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'user-1', email: 'buyer@example.com', role: 'USER' },
  } as never);
}

const LINKED_ACCOUNT = { accountId: ACCOUNT_ID, network: 'testnet', linkedAt: new Date() };

describe('ConnectWalletButton', () => {
  beforeEach(() => {
    getStellarRailConfig.mockReset().mockResolvedValue({
      enabled: true,
      network: 'testnet',
      asset: { code: 'USDC', issuer: OTHER_ACCOUNT_ID },
    });
    getStellarWallet.mockReset().mockResolvedValue(null);
    requestStellarLinkChallenge.mockReset().mockResolvedValue({
      accountId: ACCOUNT_ID,
      message: CHALLENGE_MESSAGE,
      expiresAt: new Date(Date.now() + 300_000),
    });
    linkStellarWallet.mockReset().mockResolvedValue(LINKED_ACCOUNT);
    unlinkStellarWallet.mockReset().mockResolvedValue(undefined);

    connectWallet.mockReset().mockResolvedValue(ACCOUNT_ID);
    signWalletMessage.mockReset().mockResolvedValue(SIGNATURE);
    restoreWalletAddress.mockReset().mockResolvedValue(null);
    disconnectWallet.mockReset().mockResolvedValue(undefined);

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

  it('opens the wallet picker on the network the API reports', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');

    renderWithProviders(<ConnectWalletButton />);

    await userEvent.click(await screen.findByRole('button', { name: /connect wallet/i }));

    await waitFor(() => expect(connectWallet).toHaveBeenCalledWith('testnet'));
  });

  it('links the account with a signature over the API-issued challenge', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');

    renderWithProviders(<ConnectWalletButton />);

    await userEvent.click(await screen.findByRole('button', { name: /connect wallet/i }));

    await waitFor(() => expect(requestStellarLinkChallenge).toHaveBeenCalledWith(ACCOUNT_ID));
    expect(signWalletMessage).toHaveBeenCalledWith('testnet', ACCOUNT_ID, CHALLENGE_MESSAGE);
    await waitFor(() =>
      expect(linkStellarWallet).toHaveBeenCalledWith({
        accountId: ACCOUNT_ID,
        signature: SIGNATURE,
      }),
    );
  });

  it('never links an account when the wallet refuses to sign the challenge', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');
    signWalletMessage.mockRejectedValue(new WalletSignatureUnsupportedError());

    renderWithProviders(<ConnectWalletButton />);

    await userEvent.click(await screen.findByRole('button', { name: /connect wallet/i }));

    expect(await screen.findByText(/cannot sign a message/i)).toBeInTheDocument();
    expect(linkStellarWallet).not.toHaveBeenCalled();
  });

  it('never links when the wallet signed with a different account', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');
    signWalletMessage.mockRejectedValue(
      new WalletAccountMismatchError(ACCOUNT_ID, OTHER_ACCOUNT_ID),
    );

    renderWithProviders(<ConnectWalletButton />);

    await userEvent.click(await screen.findByRole('button', { name: /connect wallet/i }));

    expect(await screen.findByText(/switch the active account/i)).toBeInTheDocument();
    expect(linkStellarWallet).not.toHaveBeenCalled();
  });

  it('points at the wallet directory when no wallet is available', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');
    connectWallet.mockRejectedValue(new WalletUnavailableError());

    renderWithProviders(<ConnectWalletButton />);

    await userEvent.click(await screen.findByRole('button', { name: /connect wallet/i }));

    const link = await screen.findByRole('link', { name: /no stellar wallet detected/i });
    expect(link).toHaveAttribute('href', 'https://stellar.org/ecosystem/wallets');
  });

  it('shows the linked account, shortened, once a wallet is connected', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');
    getStellarWallet.mockResolvedValue(LINKED_ACCOUNT);

    renderWithProviders(<ConnectWalletButton />);

    expect(await screen.findByText('GABC…STUV')).toBeInTheDocument();
  });

  it('unlinks on the server and drops the wallet session when disconnected', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');
    getStellarWallet.mockResolvedValue(LINKED_ACCOUNT);

    renderWithProviders(<ConnectWalletButton />);

    await userEvent.click(await screen.findByRole('button', { name: /GABC…STUV/ }));

    await waitFor(() => expect(unlinkStellarWallet).toHaveBeenCalled());
    expect(disconnectWallet).toHaveBeenCalled();
  });

  it('offers a re-link when the wallet is on a different account than the linked one', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');
    getStellarWallet.mockResolvedValue(LINKED_ACCOUNT);
    restoreWalletAddress.mockResolvedValue(OTHER_ACCOUNT_ID);

    renderWithProviders(<ConnectWalletButton />);

    expect(await screen.findByTestId('stellar-wallet-drift')).toBeInTheDocument();
  });

  it('stays quiet when the wallet is on the account already linked', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');
    getStellarWallet.mockResolvedValue(LINKED_ACCOUNT);
    restoreWalletAddress.mockResolvedValue(ACCOUNT_ID);

    renderWithProviders(<ConnectWalletButton />);

    await screen.findByText('GABC…STUV');
    expect(screen.queryByTestId('stellar-wallet-drift')).not.toBeInTheDocument();
  });

  it('asks the API for nothing until the session is authenticated', () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_MODE', 'live');
    useAuthStore.setState({ status: 'unauthenticated', user: null } as never);

    renderWithProviders(<ConnectWalletButton />);

    expect(getStellarWallet).not.toHaveBeenCalled();
    expect(restoreWalletAddress).not.toHaveBeenCalled();
  });
});
