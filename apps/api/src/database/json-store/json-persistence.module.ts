import { DynamicModule, Global, Module } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { resolveJsonStorePath } from '../persistence-mode';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { REFRESH_TOKENS_COLLECTION, USERS_COLLECTION } from './collections';
import { JsonDatabase } from './json-database';
import { JsonRepository } from './json-repository';

@Global()
@Module({})
export class JsonPersistenceModule {
  static register(): DynamicModule {
    const database = new JsonDatabase(resolveJsonStorePath());

    return {
      module: JsonPersistenceModule,
      providers: [
        { provide: JsonDatabase, useValue: database },
        {
          provide: getRepositoryToken(User),
          useValue: new JsonRepository(database, USERS_COLLECTION),
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: new JsonRepository(database, REFRESH_TOKENS_COLLECTION),
        },
      ],
      exports: [JsonDatabase, getRepositoryToken(User), getRepositoryToken(RefreshToken)],
    };
  }
}
