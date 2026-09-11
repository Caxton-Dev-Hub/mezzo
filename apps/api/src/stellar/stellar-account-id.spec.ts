import { createHash, randomBytes } from 'node:crypto';
import { encodeStellarAccountId, isStellarAccountId } from './stellar-account-id';

describe('stellar account ids', () => {
  it('encodes a 32-byte key into a 56-character G-prefixed StrKey', () => {
    const encoded = encodeStellarAccountId(createHash('sha256').update('escrow:1').digest());

    expect(encoded).toHaveLength(56);
    expect(encoded.startsWith('G')).toBe(true);
  });

  it('round-trips every key it encodes', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(isStellarAccountId(encodeStellarAccountId(randomBytes(32)))).toBe(true);
    }
  });

  it('rejects a key of the wrong length', () => {
    expect(() => encodeStellarAccountId(randomBytes(31))).toThrow(RangeError);
  });

  it('rejects an account id whose checksum does not match', () => {
    const valid = encodeStellarAccountId(randomBytes(32));
    const lastCharacter = valid.at(-1) === 'A' ? 'B' : 'A';
    const tampered = `${valid.slice(0, -1)}${lastCharacter}`;

    expect(isStellarAccountId(tampered)).toBe(false);
  });

  it('rejects ids that are the wrong length, contain non-base32 characters, or use another version byte', () => {
    expect(isStellarAccountId('')).toBe(false);
    expect(isStellarAccountId('G'.repeat(55))).toBe(false);
    expect(isStellarAccountId(`G${'1'.repeat(55)}`)).toBe(false);
    expect(isStellarAccountId(`S${encodeStellarAccountId(randomBytes(32)).slice(1)}`)).toBe(false);
  });
});
