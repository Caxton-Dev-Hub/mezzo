const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleButtonOptions {
  type: 'standard';
  theme: 'filled_black';
  size: 'large';
  shape: 'pill';
  text: 'continue_with';
  logo_alignment: 'center';
  width: number;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select: boolean;
    cancel_on_tap_outside: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
  cancel(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

export function googleClientId(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null;
}

let loader: Promise<GoogleAccountsId> | null = null;

export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  if (window.google?.accounts.id) {
    return Promise.resolve(window.google.accounts.id);
  }

  loader ??= new Promise<GoogleAccountsId>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');

    script.addEventListener('load', () => {
      const api = window.google?.accounts.id;
      if (api) {
        resolve(api);
      } else {
        reject(new Error('Google Identity Services failed to initialise'));
      }
    });
    script.addEventListener('error', () => reject(new Error('Could not reach Google')));

    if (!existing) {
      script.src = GSI_SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    loader = null;
    throw error;
  });

  return loader;
}

export const GOOGLE_BUTTON_OPTIONS: Omit<GoogleButtonOptions, 'width'> = {
  type: 'standard',
  theme: 'filled_black',
  size: 'large',
  shape: 'pill',
  text: 'continue_with',
  logo_alignment: 'center',
};
