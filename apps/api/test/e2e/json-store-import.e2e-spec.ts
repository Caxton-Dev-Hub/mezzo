import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../../src/database/entities/refresh-token.entity';
import { User } from '../../src/database/entities/user.entity';
import {
  REFRESH_TOKENS_COLLECTION,
  USERS_COLLECTION,
} from '../../src/database/json-store/collections';
import { importJsonStore } from '../../src/database/json-store/import-json-store';
import { JsonDatabase } from '../../src/database/json-store/json-database';
import { JsonRepository } from '../../src/database/json-store/json-repository';
import { UserRole } from '../../src/users/entities/user-role.enum';
import { KycTier } from '../../src/kyc/entities/kyc-tier.enum';

describe('JSON store import into PostgreSQL (e2e)', () => {
  let dataSource: DataSource;
  let database: JsonDatabase;

  const email = `json-import-${Date.now()}@example.com`;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [`${__dirname}/../../src/database/entities/**/*.entity.ts`],
      synchronize: false,
    });
    await dataSource.initialize();

    const directory = await mkdtemp(join(tmpdir(), 'mezzo-import-'));
    database = new JsonDatabase(join(directory, 'store.json'));

    const users = new JsonRepository(database, USERS_COLLECTION);
    const tokens = new JsonRepository(database, REFRESH_TOKENS_COLLECTION);

    const user = await users.save(
      users.create({
        email,
        passwordHash: '$argon2id$fake',
        googleSub: `google-${Date.now()}`,
        businessName: 'Lagos Camera Co',
        kycTier: KycTier.TIER_1,
      }),
    );

    await tokens.save(
      tokens.create({
        id: '11111111-1111-4111-8111-111111111111',
        userId: user.id,
        familyId: '22222222-2222-4222-8222-222222222222',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('loads the JSON rows into the real tables with their types intact', async () => {
    const summary = await importJsonStore(dataSource, database);

    expect(summary).toEqual({ users: 1, refreshTokens: 1 });

    const stored = await dataSource.getRepository(User).findOne({ where: { email } });
    expect(stored).not.toBeNull();
    expect(stored?.role).toBe(UserRole.USER);
    expect(stored?.kycTier).toBe(KycTier.TIER_1);
    expect(stored?.businessName).toBe('Lagos Camera Co');
    expect(stored?.passwordHash).toBe('$argon2id$fake');
    expect(stored?.createdAt).toBeInstanceOf(Date);

    const token = await dataSource
      .getRepository(RefreshToken)
      .findOne({ where: { id: '11111111-1111-4111-8111-111111111111' } });
    expect(token?.userId).toBe(stored?.id);
    expect(token?.revokedAt).toBeNull();
    expect(token?.expiresAt).toBeInstanceOf(Date);
  });

  it('is safe to re-run without duplicating rows', async () => {
    await importJsonStore(dataSource, database);

    const count = await dataSource.getRepository(User).count({ where: { email } });

    expect(count).toBe(1);
  });
});
