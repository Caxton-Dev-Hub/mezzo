'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGoogleLogin } from '../../hooks/use-google-login';
import { ApiError } from '../../lib/api-error';
import {
  GOOGLE_BUTTON_OPTIONS,
  googleClientId,
  loadGoogleIdentity,
  type GoogleCredentialResponse,
} from '../../lib/google-identity';

interface GoogleSignInButtonProps {
  redirectTo?: string;
}

export function GoogleSignInButton({ redirectTo }: GoogleSignInButtonProps) {
  const router = useRouter();
  const mutation = useGoogleLogin();
  const containerRef = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  const clientId = googleClientId();

  const mutate = mutation.mutate;

  useEffect(() => {
    if (!clientId) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;

    loadGoogleIdentity()
      .then((api) => {
        if (cancelled) {
          return;
        }

        api.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: (response: GoogleCredentialResponse) => {
            if (!response.credential) {
              return;
            }

            mutate(
              { idToken: response.credential },
              { onSuccess: () => router.push(redirectTo || '/dashboard') },
            );
          },
        });

        api.renderButton(container, {
          ...GOOGLE_BUTTON_OPTIONS,
          width: Math.min(container.offsetWidth || 320, 400),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setUnavailable(true);
        }
      });

    return () => {
      cancelled = true;
      window.google?.accounts.id.cancel();
    };
  }, [clientId, mutate, redirectTo, router]);

  if (!clientId) {
    return null;
  }

  const serverError =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? 'Google sign-in failed. Please try again.'
        : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-fog/20" />
        <span className="text-[11px] uppercase tracking-[0.14em] text-fog">or</span>
        <span className="h-px flex-1 bg-fog/20" />
      </div>
      <div ref={containerRef} className="flex min-h-[40px] justify-center" />
      {unavailable ? (
        <p role="alert" className="text-center text-[13px] text-fog">
          Google sign-in is unavailable right now. Use your email and password.
        </p>
      ) : null}
      {serverError ? (
        <p role="alert" className="text-center text-[13px] text-danger">
          {serverError}
        </p>
      ) : null}
    </div>
  );
}
