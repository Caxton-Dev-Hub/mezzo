import { DomainError } from '../../common/errors/domain-error';
import { KycTier } from '../entities/kyc-tier.enum';

export class KycTierRequiredError extends DomainError {
  readonly code = 'KYC_TIER_REQUIRED';
  readonly statusCode = 403;

  constructor(requiredTier: KycTier) {
    super(`This action requires ${requiredTier} verification or higher`, { requiredTier });
  }
}
