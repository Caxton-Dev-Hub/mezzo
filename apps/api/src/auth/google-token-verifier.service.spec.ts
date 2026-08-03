import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { GoogleTokenVerifier } from './google-token-verifier.service';
import { GoogleAuthNotConfiguredError } from './errors/google-auth-not-configured.error';
import { GoogleAuthUnavailableError } from './errors/google-auth-unavailable.error';
import { InvalidGoogleTokenError } from './errors/invalid-google-token.error';

const CLIENT_ID = '1234567890-abcdef.apps.googleusercontent.com';
const KID = 'test-key-id';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

function jwks(key: KeyObject = publicKey, kid = KID): { keys: unknown[] } {
  const jwk = key.export({ format: 'jwk' });
  return { keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] };
}

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

function mockJwksResponse(body: unknown, ok = true): void {
  fetchMock.mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  } as unknown as FetchResponse);
}

function signIdToken(
  claims: Record<string, unknown>,
  options: { kid?: string; algorithm?: 'RS256' | 'HS256'; key?: string } = {},
): string {
  const jwtService = new JwtService({});
  return jwtService.sign(claims, {
    algorithm: options.algorithm ?? 'RS256',
    keyid: options.kid ?? KID,
    ...(options.algorithm === 'HS256'
      ? { secret: options.key ?? 'attacker-controlled-secret' }
      : { privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }),
  });
}

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: 'google-user-1',
    email: 'buyer@example.com',
    email_verified: true,
    aud: CLIENT_ID,
    iss: 'https://accounts.google.com',
    ...overrides,
  };
}

function buildVerifier(
  env: Record<string, unknown> = { GOOGLE_AUTH_ENABLED: true, GOOGLE_CLIENT_ID: CLIENT_ID },
): GoogleTokenVerifier {
  const configService = {
    get: (key: string) => env[key],
    getOrThrow: (key: string) => {
      if (!(key in env)) {
        throw new Error(`Missing ${key}`);
      }
      return env[key];
    },
  } as unknown as ConfigService;

  return new GoogleTokenVerifier(new JwtService({}), configService);
}

describe('GoogleTokenVerifier', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('accepts a token signed by Google for our client id', async () => {
    mockJwksResponse(jwks());

    const identity = await buildVerifier().verify(signIdToken(validClaims()));

    expect(identity).toEqual({
      sub: 'google-user-1',
      email: 'buyer@example.com',
      emailVerified: true,
    });
  });

  it('reports an unverified Google email rather than silently trusting it', async () => {
    mockJwksResponse(jwks());

    const identity = await buildVerifier().verify(
      signIdToken(validClaims({ email_verified: false })),
    );

    expect(identity.emailVerified).toBe(false);
  });

  it('rejects a token minted for a different client id', async () => {
    mockJwksResponse(jwks());

    await expect(
      buildVerifier().verify(
        signIdToken(validClaims({ aud: 'other-app.apps.googleusercontent.com' })),
      ),
    ).rejects.toBeInstanceOf(InvalidGoogleTokenError);
  });

  it('rejects a token from an unexpected issuer', async () => {
    mockJwksResponse(jwks());

    await expect(
      buildVerifier().verify(signIdToken(validClaims({ iss: 'https://evil.example.com' }))),
    ).rejects.toBeInstanceOf(InvalidGoogleTokenError);
  });

  it('rejects an expired token', async () => {
    mockJwksResponse(jwks());
    const expired = validClaims({
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600,
    });

    await expect(buildVerifier().verify(signIdToken(expired))).rejects.toBeInstanceOf(
      InvalidGoogleTokenError,
    );
  });

  it('rejects a symmetrically signed token instead of confusing it for RS256', async () => {
    mockJwksResponse(jwks());

    await expect(
      buildVerifier().verify(signIdToken(validClaims(), { algorithm: 'HS256' })),
    ).rejects.toBeInstanceOf(InvalidGoogleTokenError);
  });

  it('rejects a token signed by a key Google does not publish', async () => {
    const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });
    mockJwksResponse(jwks(foreign.publicKey));

    await expect(buildVerifier().verify(signIdToken(validClaims()))).rejects.toBeInstanceOf(
      InvalidGoogleTokenError,
    );
  });

  it('rejects a token whose key id is absent from the JWKS', async () => {
    mockJwksResponse(jwks(publicKey, 'some-other-kid'));

    await expect(buildVerifier().verify(signIdToken(validClaims()))).rejects.toBeInstanceOf(
      InvalidGoogleTokenError,
    );
  });

  it('surfaces an unreachable JWKS as unavailable, not as a bad token', async () => {
    fetchMock.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(buildVerifier().verify(signIdToken(validClaims()))).rejects.toBeInstanceOf(
      GoogleAuthUnavailableError,
    );
  });

  it('surfaces a non-200 JWKS response as unavailable', async () => {
    mockJwksResponse({}, false);

    await expect(buildVerifier().verify(signIdToken(validClaims()))).rejects.toBeInstanceOf(
      GoogleAuthUnavailableError,
    );
  });

  it('refuses to run when Google sign-in is disabled', async () => {
    mockJwksResponse(jwks());

    await expect(
      buildVerifier({ GOOGLE_AUTH_ENABLED: false }).verify(signIdToken(validClaims())),
    ).rejects.toBeInstanceOf(GoogleAuthNotConfiguredError);
  });

  it('refuses to run when the client id is missing', async () => {
    mockJwksResponse(jwks());

    await expect(
      buildVerifier({ GOOGLE_AUTH_ENABLED: true }).verify(signIdToken(validClaims())),
    ).rejects.toBeInstanceOf(GoogleAuthNotConfiguredError);
  });

  it('fetches the JWKS once across concurrent verifications', async () => {
    mockJwksResponse(jwks());
    const verifier = buildVerifier();

    await Promise.all([
      verifier.verify(signIdToken(validClaims())),
      verifier.verify(signIdToken(validClaims())),
      verifier.verify(signIdToken(validClaims())),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
