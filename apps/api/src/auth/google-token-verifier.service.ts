import { createPublicKey, type JsonWebKey } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { GoogleAuthNotConfiguredError } from './errors/google-auth-not-configured.error';
import { GoogleAuthUnavailableError } from './errors/google-auth-unavailable.error';
import { InvalidGoogleTokenError } from './errors/invalid-google-token.error';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS: [string, ...string[]] = [
  'https://accounts.google.com',
  'accounts.google.com',
];
const JWKS_REFETCH_COOLDOWN_MS = 60_000;

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
}

interface GoogleJwk extends JsonWebKey {
  kid: string;
  kty: string;
  alg: string;
}

interface GoogleIdTokenClaims {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
}

@Injectable()
export class GoogleTokenVerifier {
  private keysByKid = new Map<string, string>();
  private lastAttemptAt = 0;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    const clientId = this.clientId();
    const publicKey = await this.resolveKey(this.readKeyId(idToken));

    let claims: GoogleIdTokenClaims;
    try {
      claims = await this.jwtService.verifyAsync<GoogleIdTokenClaims>(idToken, {
        publicKey,
        algorithms: ['RS256'],
        audience: clientId,
        issuer: GOOGLE_ISSUERS,
      });
    } catch {
      throw new InvalidGoogleTokenError();
    }

    if (!claims.sub || !claims.email) {
      throw new InvalidGoogleTokenError();
    }

    return {
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    };
  }

  private clientId(): string {
    const enabled = this.configService.getOrThrow<boolean>('GOOGLE_AUTH_ENABLED');
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');

    if (!enabled || !clientId) {
      throw new GoogleAuthNotConfiguredError();
    }

    return clientId;
  }

  private readKeyId(idToken: string): string {
    const decoded = this.jwtService.decode<{ header?: { kid?: string; alg?: string } } | null>(
      idToken,
      { complete: true },
    );

    if (!decoded?.header?.kid || decoded.header.alg !== 'RS256') {
      throw new InvalidGoogleTokenError();
    }

    return decoded.header.kid;
  }

  private async resolveKey(kid: string): Promise<string> {
    const cached = this.keysByKid.get(kid);
    if (cached) {
      return cached;
    }

    if (this.inFlight || Date.now() - this.lastAttemptAt >= JWKS_REFETCH_COOLDOWN_MS) {
      await this.refreshKeys();
    }

    const refreshed = this.keysByKid.get(kid);
    if (!refreshed) {
      throw this.keysByKid.size > 0
        ? new InvalidGoogleTokenError()
        : new GoogleAuthUnavailableError();
    }

    return refreshed;
  }

  private refreshKeys(): Promise<void> {
    this.inFlight ??= this.fetchKeys().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async fetchKeys(): Promise<void> {
    this.lastAttemptAt = Date.now();

    let payload: { keys?: GoogleJwk[] };

    try {
      const response = await fetch(GOOGLE_JWKS_URL);

      if (!response.ok) {
        throw new GoogleAuthUnavailableError();
      }

      payload = (await response.json()) as { keys?: GoogleJwk[] };
    } catch {
      throw new GoogleAuthUnavailableError();
    }

    const keys = new Map<string, string>();

    for (const jwk of payload.keys ?? []) {
      if (jwk.kty !== 'RSA' || jwk.alg !== 'RS256') {
        continue;
      }

      keys.set(
        jwk.kid,
        createPublicKey({ key: jwk, format: 'jwk' })
          .export({ type: 'spki', format: 'pem' })
          .toString(),
      );
    }

    this.keysByKid = keys;
  }
}
