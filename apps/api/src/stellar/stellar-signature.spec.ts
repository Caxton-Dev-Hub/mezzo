import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { verifyStellarSignature } from './stellar-signature';
import { StellarSignatureInvalidError } from './errors/stellar-signature-invalid.error';

const MESSAGE = 'mezzoescrow.xyz wants you to link this Stellar account.';

describe('verifyStellarSignature', () => {
  it('accepts a base64 signature, the SEP-43 encoding', () => {
    const keypair = Keypair.random();
    const signature = keypair.sign(Buffer.from(MESSAGE, 'utf8')).toString('base64');

    expect(verifyStellarSignature(keypair.publicKey(), MESSAGE, signature)).toBe(true);
  });

  it('accepts a hex signature, which some wallets return instead', () => {
    const keypair = Keypair.random();
    const signature = keypair.sign(Buffer.from(MESSAGE, 'utf8')).toString('hex');

    expect(verifyStellarSignature(keypair.publicKey(), MESSAGE, signature)).toBe(true);
  });

  it('accepts a signature over the SHA-256 digest, which some wallets sign instead', () => {
    const keypair = Keypair.random();
    const digest = createHash('sha256').update(Buffer.from(MESSAGE, 'utf8')).digest();
    const signature = keypair.sign(digest).toString('base64');

    expect(verifyStellarSignature(keypair.publicKey(), MESSAGE, signature)).toBe(true);
  });

  it('rejects a digest signature taken over a different message', () => {
    const keypair = Keypair.random();
    const digest = createHash('sha256').update(Buffer.from('another message', 'utf8')).digest();
    const signature = keypair.sign(digest).toString('base64');

    expect(verifyStellarSignature(keypair.publicKey(), MESSAGE, signature)).toBe(false);
  });

  it('rejects a signature over a different message', () => {
    const keypair = Keypair.random();
    const signature = keypair.sign(Buffer.from('another message', 'utf8')).toString('base64');

    expect(verifyStellarSignature(keypair.publicKey(), MESSAGE, signature)).toBe(false);
  });

  it('rejects a signature from another account', () => {
    const signature = Keypair.random().sign(Buffer.from(MESSAGE, 'utf8')).toString('base64');

    expect(verifyStellarSignature(Keypair.random().publicKey(), MESSAGE, signature)).toBe(false);
  });

  it('rejects a malformed account id without throwing', () => {
    const keypair = Keypair.random();
    const signature = keypair.sign(Buffer.from(MESSAGE, 'utf8')).toString('base64');

    expect(verifyStellarSignature('not-an-account', MESSAGE, signature)).toBe(false);
  });

  it('rejects a signature that is not 64 bytes', () => {
    const keypair = Keypair.random();

    expect(verifyStellarSignature(keypair.publicKey(), MESSAGE, 'c2hvcnQ=')).toBe(false);
  });
});

describe('StellarSignatureInvalidError', () => {
  it('is a 403 and never a 401, because the web client replays 401s', () => {
    expect(new StellarSignatureInvalidError('GABC').statusCode).toBe(403);
  });
});
