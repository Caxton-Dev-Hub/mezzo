import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();
  const plain = 'correct horse battery staple';

  it('hashes using argon2id', async () => {
    const hash = await service.hash(plain);
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('produces a different hash for the same password on each call (random salt)', async () => {
    const first = await service.hash(plain);
    const second = await service.hash(plain);
    expect(first).not.toBe(second);
  });

  it('verifies a matching password', async () => {
    const hash = await service.hash(plain);
    await expect(service.verify(hash, plain)).resolves.toBe(true);
  });

  it('rejects a non-matching password', async () => {
    const hash = await service.hash(plain);
    await expect(service.verify(hash, 'wrong password')).resolves.toBe(false);
  });
});
