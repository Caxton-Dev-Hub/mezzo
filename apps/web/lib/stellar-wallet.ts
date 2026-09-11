export const FREIGHTER_INSTALL_URL = 'https://www.freighter.app';

interface FreighterAccess {
  address?: string;
  error?: string;
}

interface FreighterApi {
  requestAccess?: () => Promise<FreighterAccess | string>;
  getPublicKey?: () => Promise<string>;
}

declare global {
  interface Window {
    freighterApi?: FreighterApi;
  }
}

export class WalletUnavailableError extends Error {
  constructor() {
    super('No Stellar wallet extension was found in this browser');
    this.name = 'WalletUnavailableError';
  }
}

export class WalletRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletRejectedError';
  }
}

export function isWalletAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.freighterApi);
}

export async function connectWallet(): Promise<string> {
  const api = typeof window === 'undefined' ? undefined : window.freighterApi;
  if (!api) {
    throw new WalletUnavailableError();
  }

  if (api.requestAccess) {
    const access = await api.requestAccess();
    if (typeof access === 'string') {
      return access;
    }
    if (access.error) {
      throw new WalletRejectedError(access.error);
    }
    if (access.address) {
      return access.address;
    }
  }

  if (api.getPublicKey) {
    return api.getPublicKey();
  }

  throw new WalletUnavailableError();
}
