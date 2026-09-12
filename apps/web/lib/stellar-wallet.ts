import type { StellarNetworkName } from '@mezzo/shared-types';

export class WalletUnavailableError extends Error {
  constructor() {
    super('No Stellar wallet is available in this browser');
    this.name = 'WalletUnavailableError';
  }
}

export class WalletRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletRejectedError';
  }
}

export class WalletAccountMismatchError extends Error {
  constructor(expected: string, signer: string) {
    super(
      `Your wallet signed with ${signer.slice(0, 4)}…${signer.slice(-4)} but you are linking ${expected.slice(0, 4)}…${expected.slice(-4)}. Switch the active account in your wallet and try again.`,
    );
    this.name = 'WalletAccountMismatchError';
  }
}

export class WalletSignatureUnsupportedError extends Error {
  constructor() {
    super('This wallet cannot sign a message, so it cannot prove it owns the account');
    this.name = 'WalletSignatureUnsupportedError';
  }
}

type Kit = typeof import('@creit.tech/stellar-wallets-kit/sdk').StellarWalletsKit;

let ready: Promise<Kit> | null = null;

async function loadKit(network: StellarNetworkName): Promise<Kit> {
  if (typeof window === 'undefined') {
    throw new WalletUnavailableError();
  }

  ready ??= (async () => {
    const [{ StellarWalletsKit }, { defaultModules }, { Networks }] = await Promise.all([
      import('@creit.tech/stellar-wallets-kit/sdk'),
      import('@creit.tech/stellar-wallets-kit/modules/utils'),
      import('@creit.tech/stellar-wallets-kit/types'),
    ]);

    StellarWalletsKit.init({
      modules: defaultModules(),
      network: network === 'public' ? Networks.PUBLIC : Networks.TESTNET,
      authModal: { showInstallLabel: true },
    });

    return StellarWalletsKit;
  })();

  return ready;
}

function toWalletError(error: unknown): Error {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : 'The wallet did not complete the request';

  if (/not (installed|available|found)/i.test(message)) {
    return new WalletUnavailableError();
  }

  if (/(sign message|signMessage).*(support|implement)|not supported/i.test(message)) {
    return new WalletSignatureUnsupportedError();
  }

  return new WalletRejectedError(message);
}

export async function connectWallet(network: StellarNetworkName): Promise<string> {
  const kit = await loadKit(network);

  try {
    const { address } = await kit.authModal();
    return address;
  } catch (error) {
    throw toWalletError(error);
  }
}

export async function signWalletMessage(
  network: StellarNetworkName,
  address: string,
  message: string,
): Promise<string> {
  const kit = await loadKit(network);

  try {
    const { signedMessage, signerAddress } = await kit.signMessage(message, { address });
    if (!signedMessage) {
      throw new WalletSignatureUnsupportedError();
    }
    if (signerAddress && signerAddress !== address) {
      throw new WalletAccountMismatchError(address, signerAddress);
    }
    return signedMessage;
  } catch (error) {
    if (
      error instanceof WalletSignatureUnsupportedError ||
      error instanceof WalletAccountMismatchError
    ) {
      throw error;
    }
    throw toWalletError(error);
  }
}

export async function restoreWalletAddress(network: StellarNetworkName): Promise<string | null> {
  try {
    const kit = await loadKit(network);
    const { address } = await kit.getAddress();
    return address || null;
  } catch {
    return null;
  }
}

export async function disconnectWallet(): Promise<void> {
  if (!ready) {
    return;
  }

  try {
    const kit = await ready;
    await kit.disconnect();
  } catch {
    return;
  }
}
