import 'reflect-metadata';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { AppDataSource } from '../data-source';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { resolveJsonStorePath } from '../persistence-mode';
import { REFRESH_TOKENS_COLLECTION, USERS_COLLECTION } from './collections';
import { JsonDatabase } from './json-database';
import { JsonCollectionSchema, JsonEntity, JsonRepository } from './json-repository';

export interface ImportSummary {
  users: number;
  refreshTokens: number;
}

async function importCollection<T extends JsonEntity & ObjectLiteral>(
  dataSource: DataSource,
  database: JsonDatabase,
  schema: JsonCollectionSchema<T>,
  entity: EntityTarget<T>,
): Promise<number> {
  const rows = await new JsonRepository(database, schema).find({
    order: { createdAt: 'ASC' } as Partial<Record<keyof T & string, 'ASC'>>,
  });

  if (rows.length === 0) {
    return 0;
  }

  await dataSource.getRepository(entity).save(rows, { chunk: 200 });
  return rows.length;
}

export async function importJsonStore(
  dataSource: DataSource,
  database: JsonDatabase,
): Promise<ImportSummary> {
  const users = await importCollection(dataSource, database, USERS_COLLECTION, User);
  const refreshTokens = await importCollection(
    dataSource,
    database,
    REFRESH_TOKENS_COLLECTION,
    RefreshToken,
  );

  return { users, refreshTokens };
}

async function main(): Promise<void> {
  const path = resolveJsonStorePath();
  await AppDataSource.initialize();

  try {
    const summary = await importJsonStore(AppDataSource, new JsonDatabase(path));
    process.stdout.write(
      `Imported ${summary.users} users and ${summary.refreshTokens} refresh tokens from ${path}\n`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
