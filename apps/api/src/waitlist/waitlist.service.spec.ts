import { Repository } from 'typeorm';
import { WaitlistService } from './waitlist.service';
import { WaitlistSignup } from '../database/entities/waitlist-signup.entity';

function buildHarness(
  existing: WaitlistSignup | null,
  options: { rows?: WaitlistSignup[]; total?: number } = {},
): {
  service: WaitlistService;
  create: jest.Mock;
  save: jest.Mock;
  findAndCount: jest.Mock;
} {
  const create = jest.fn((input: Partial<WaitlistSignup>) => input as WaitlistSignup);
  const save = jest.fn((signup: WaitlistSignup) =>
    Promise.resolve({ ...signup, id: 'generated-id', createdAt: new Date('2026-08-14T00:00:00Z') }),
  );
  const findAndCount = jest
    .fn()
    .mockResolvedValue([options.rows ?? [], options.total ?? options.rows?.length ?? 0]);
  const repository = {
    findOne: jest.fn(() => Promise.resolve(existing)),
    create,
    save,
    findAndCount,
  } as unknown as Repository<WaitlistSignup>;

  return { service: new WaitlistService(repository), create, save, findAndCount };
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

describe('WaitlistService.findAll', () => {
  it('paginates signups newest first', async () => {
    const rows: WaitlistSignup[] = [
      { id: '1', email: 'newest@example.com', createdAt: new Date('2026-08-10T00:00:00Z') },
    ];
    const { service, findAndCount } = buildHarness(null, { rows, total: 42 });

    const result = await service.findAll({ page: 2, pageSize: 20 });

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ order: { createdAt: 'DESC' }, skip: 20, take: 20 }),
    );
    expect(result.total).toBe(42);
    expect(result.items).toEqual([{ email: 'newest@example.com', createdAt: rows[0].createdAt }]);
  });
});
