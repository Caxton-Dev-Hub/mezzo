import { KycTier } from '../../kyc/entities/kyc-tier.enum';
import { UserRole } from '../../users/entities/user-role.enum';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { JsonCollectionSchema } from './json-repository';

export const USERS_COLLECTION: JsonCollectionSchema<User> = {
  table: 'users',
  entity: 'User',
  fields: [
    'id',
    'email',
    'passwordHash',
    'googleSub',
    'phone',
    'role',
    'kycTier',
    'businessName',
    'bio',
    'location',
    'avatarKey',
    'createdAt',
    'updatedAt',
  ],
  dateFields: ['createdAt', 'updatedAt'],
  unique: [['email'], ['googleSub']],
  hasUpdatedAt: true,
  defaults: () => ({
    passwordHash: null,
    googleSub: null,
    phone: null,
    role: UserRole.USER,
    kycTier: KycTier.TIER_0,
    businessName: null,
    bio: null,
    location: null,
    avatarKey: null,
  }),
};

export const REFRESH_TOKENS_COLLECTION: JsonCollectionSchema<RefreshToken> = {
  table: 'refresh_tokens',
  entity: 'RefreshToken',
  fields: ['id', 'userId', 'familyId', 'tokenHash', 'expiresAt', 'revokedAt', 'createdAt'],
  dateFields: ['expiresAt', 'revokedAt', 'createdAt'],
  unique: [],
  hasUpdatedAt: false,
  defaults: () => ({ revokedAt: null }),
};
