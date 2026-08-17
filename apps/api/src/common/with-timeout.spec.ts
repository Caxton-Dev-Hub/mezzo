import { withTimeout } from './with-timeout';

describe('withTimeout', () => {
  it('resolves with the underlying value when it settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('done'), 50)).resolves.toBe('done');
  });

  it('rejects with the underlying error when it rejects before the timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom');
  });

  it('rejects once the timeout elapses if the promise never settles', async () => {
    const neverSettles = new Promise<void>(() => {});

    await expect(withTimeout(neverSettles, 10)).rejects.toThrow('timed out after 10ms');
  });
});
