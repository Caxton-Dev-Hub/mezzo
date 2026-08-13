import { DynamicModule, Global, Module } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { resolveJsonStorePath } from '../persistence-mode';
import { EmailVerificationCode } from '../entities/email-verification-code.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import {
  EMAIL_VERIFICATION_CODES_COLLECTION,
  PASSWORD_RESET_TOKENS_COLLECTION,
  REFRESH_TOKENS_COLLECTION,
  USERS_COLLECTION,
} from './collections';
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
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: new JsonRepository(database, PASSWORD_RESET_TOKENS_COLLECTION),
        },
        {
          provide: getRepositoryToken(EmailVerificationCode),
          useValue: new JsonRepository(database, EMAIL_VERIFICATION_CODES_COLLECTION),
        },
      ],
      exports: [
        JsonDatabase,
        getRepositoryToken(User),
        getRepositoryToken(RefreshToken),
        getRepositoryToken(PasswordResetToken),
        getRepositoryToken(EmailVerificationCode),
      ],
    };
  }
}
