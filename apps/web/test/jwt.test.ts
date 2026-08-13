import { describe, expect, it } from 'vitest';
import { decodeJwtExpiryMs } from '@/lib/jwt';

function makeToken(payload: unknown): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

describe('decodeJwtExpiryMs', () => {
  it('converts the exp claim from seconds to milliseconds', () => {
    const token = makeToken({ sub: 'user-1', exp: 1_800_000_000 });

    expect(decodeJwtExpiryMs(token)).toBe(1_800_000_000_000);
  });

  it('returns null for a token with no exp claim', () => {
    expect(decodeJwtExpiryMs(makeToken({ sub: 'user-1' }))).toBeNull();
  });

  it('returns null when exp is not a number', () => {
    expect(decodeJwtExpiryMs(makeToken({ exp: 'soon' }))).toBeNull();
  });

  it('returns null for a token that is not three segments', () => {
    expect(decodeJwtExpiryMs('not-a-jwt')).toBeNull();
    expect(decodeJwtExpiryMs('only.two')).toBeNull();
  });

  it('returns null rather than throwing on an undecodable payload', () => {
    expect(decodeJwtExpiryMs('header.@@@not-base64@@@.signature')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeJwtExpiryMs('')).toBeNull();
  });

  it('reads a payload containing url-unsafe base64 characters', () => {
    const token = makeToken({ sub: 'user-1?&=', exp: 2_000_000_000 });

    expect(decodeJwtExpiryMs(token)).toBe(2_000_000_000_000);
  });
});
