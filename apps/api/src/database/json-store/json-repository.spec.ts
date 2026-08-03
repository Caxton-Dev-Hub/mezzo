import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { User } from '../entities/user.entity';
import { UserRole } from '../../users/entities/user-role.enum';
import { KycTier } from '../../kyc/entities/kyc-tier.enum';
import { REFRESH_TOKENS_COLLECTION, USERS_COLLECTION } from './collections';
import { JsonDatabase, JSON_STORE_VERSION } from './json-database';
import { JsonRepository } from './json-repository';
import { UniqueConstraintViolationError } from './errors/unique-constraint-violation.error';
import { JsonStoreUnavailableError } from './errors/json-store-unavailable.error';

async function storePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mezzo-json-store-'));
  return join(directory, 'store.json');
}

async function readDocument(path: string): Promise<{
  version: number;
  tables: Record<string, { entity: string; rows: Record<string, unknown>[] }>;
}> {
  return JSON.parse(await readFile(path, 'utf8')) as {
    version: number;
    tables: Record<string, { entity: string; rows: Record<string, unknown>[] }>;
  };
}

function usersRepository(path: string): JsonRepository<User> {
  return new JsonRepository(new JsonDatabase(path), USERS_COLLECTION);
}

describe('JsonRepository', () => {
  it('assigns an id and timestamps on first save, mirroring the database defaults', async () => {
    const path = await storePath();
    const users = usersRepository(path);

    const user = await users.save(users.create({ email: 'buyer@example.com' }));

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.role).toBe(UserRole.USER);
    expect(user.kycTier).toBe(KycTier.TIER_0);
    expect(user.passwordHash).toBeNull();
  });

  it('persists rows keyed by the real table name so an import knows its target', async () => {
    const path = await storePath();
    const users = usersRepository(path);

    await users.save(users.create({ email: 'buyer@example.com' }));
    const document = await readDocument(path);

    expect(document.version).toBe(JSON_STORE_VERSION);
    expect(document.tables.users.entity).toBe('User');
    expect(Object.keys(document.tables.users.rows[0]).sort()).toEqual(
      [...USERS_COLLECTION.fields].sort(),
    );
  });

  it('writes dates as ISO-8601 strings and reads them back as Date objects', async () => {
    const path = await storePath();
    const users = usersRepository(path);

    const saved = await users.save(users.create({ email: 'buyer@example.com' }));
    const document = await readDocument(path);
    expect(typeof document.tables.users.rows[0].createdAt).toBe('string');

    const reloaded = await usersRepository(path).findOne({ where: { id: saved.id } });
    expect(reloaded?.createdAt).toBeInstanceOf(Date);
    expect(reloaded?.createdAt.toISOString()).toBe(saved.createdAt.toISOString());
  });

  it('survives a restart by reading the file back', async () => {
    const path = await storePath();
    await usersRepository(path).save(
      usersRepository(path).create({ email: 'buyer@example.com', passwordHash: 'hash' }),
    );

    const found = await usersRepository(path).findOne({ where: { email: 'buyer@example.com' } });

    expect(found?.passwordHash).toBe('hash');
  });

  it('updates an existing row in place rather than appending a duplicate', async () => {
    const path = await storePath();
    const users = usersRepository(path);

    const user = await users.save(users.create({ email: 'buyer@example.com' }));
    user.bio = 'Sells cameras';
    await users.save(user);

    const document = await readDocument(path);
    expect(document.tables.users.rows).toHaveLength(1);
    expect(document.tables.users.rows[0].bio).toBe('Sells cameras');
  });

  it('refuses a duplicate email the way the unique index would', async () => {
    const path = await storePath();
    const users = usersRepository(path);

    await users.save(users.create({ email: 'buyer@example.com' }));

    await expect(users.save(users.create({ email: 'buyer@example.com' }))).rejects.toBeInstanceOf(
      UniqueConstraintViolationError,
    );
  });

  it('allows many rows with a null googleSub, as a nullable unique index does', async () => {
    const path = await storePath();
    const users = usersRepository(path);

    await users.save(users.create({ email: 'one@example.com' }));
    await users.save(users.create({ email: 'two@example.com' }));

    const document = await readDocument(path);
    expect(document.tables.users.rows).toHaveLength(2);
  });

  it('orders findAll results by the requested column', async () => {
    const path = await storePath();
    const users = usersRepository(path);

    const first = await users.save(users.create({ email: 'one@example.com' }));
    const second = await users.save(users.create({ email: 'two@example.com' }));
    second.createdAt = new Date(first.createdAt.getTime() + 60_000);
    await users.save(second);

    const ascending = await users.find({ order: { createdAt: 'ASC' } });

    expect(ascending.map((user) => user.email)).toEqual(['one@example.com', 'two@example.com']);
  });

  it('applies a patch to every row matching the criteria', async () => {
    const path = await storePath();
    const tokens = new JsonRepository(new JsonDatabase(path), REFRESH_TOKENS_COLLECTION);
    const base = {
      familyId: 'family-1',
      userId: 'user-1',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
    };

    await tokens.save(tokens.create({ ...base, id: 'token-1' }));
    await tokens.save(tokens.create({ ...base, id: 'token-2' }));
    await tokens.save(tokens.create({ ...base, id: 'token-3', familyId: 'family-2' }));

    const revokedAt = new Date();
    await tokens.update({ familyId: 'family-1' }, { revokedAt });

    const revoked = await tokens.findOne({ where: { id: 'token-1' } });
    const untouched = await tokens.findOne({ where: { id: 'token-3' } });

    expect(revoked?.revokedAt?.toISOString()).toBe(revokedAt.toISOString());
    expect(untouched?.revokedAt).toBeNull();
  });

  it('refuses to read a store written by a future version', async () => {
    const path = await storePath();
    await writeFile(path, JSON.stringify({ version: 99, updatedAt: '', tables: {} }), 'utf8');

    await expect(usersRepository(path).find()).rejects.toBeInstanceOf(JsonStoreUnavailableError);
  });

  it('refuses to read a corrupt store instead of starting empty', async () => {
    const path = await storePath();
    await writeFile(path, '{ not json', 'utf8');

    await expect(usersRepository(path).find()).rejects.toBeInstanceOf(JsonStoreUnavailableError);
  });

  it('keeps every concurrent write in the file', async () => {
    const path = await storePath();
    const users = usersRepository(path);

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        users.save(users.create({ email: `user-${index}@example.com` })),
      ),
    );

    const document = await readDocument(path);
    expect(document.tables.users.rows).toHaveLength(10);
  });
});
