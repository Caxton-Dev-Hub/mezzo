import { Repository } from 'typeorm';
import { WaitlistService } from './waitlist.service';
import { WaitlistSignup } from '../database/entities/waitlist-signup.entity';

function buildHarness(existing: WaitlistSignup | null): {
  service: WaitlistService;
  create: jest.Mock;
  save: jest.Mock;
} {
  const create = jest.fn((input: Partial<WaitlistSignup>) => input as WaitlistSignup);
  const save = jest.fn((signup: WaitlistSignup) =>
    Promise.resolve({ ...signup, id: 'generated-id', createdAt: new Date('2026-08-14T00:00:00Z') }),
  );
  const repository = {
    findOne: jest.fn(() => Promise.resolve(existing)),
    create,
    save,
  } as unknown as Repository<WaitlistSignup>;

  return { service: new WaitlistService(repository), create, save };
}

describe('WaitlistService', () => {
  it('lowercases the email and stores a new signup', async () => {
    const { service, create } = buildHarness(null);

    const result = await service.join('New.User@Example.com');

    expect(create).toHaveBeenCalledWith({ email: 'new.user@example.com' });
    expect(result.email).toBe('new.user@example.com');
    expect(result.createdAt).toEqual(new Date('2026-08-14T00:00:00Z'));
  });

  it('is idempotent for an email already on the waitlist', async () => {
    const existing: WaitlistSignup = {
      id: 'existing-id',
      email: 'already@example.com',
      createdAt: new Date('2026-08-01T00:00:00Z'),
    };
    const { service, save } = buildHarness(existing);

    const result = await service.join('already@example.com');

    expect(save).not.toHaveBeenCalled();
    expect(result).toEqual({ email: 'already@example.com', createdAt: existing.createdAt });
  });
});
