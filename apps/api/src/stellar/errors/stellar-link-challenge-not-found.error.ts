import { DomainError } from '../../common/errors/domain-error';

export class StellarLinkChallengeNotFoundError extends DomainError {
  readonly code = 'STELLAR_LINK_CHALLENGE_NOT_FOUND';
  readonly statusCode = 400;

  constructor() {
    super('That wallet link challenge has expired or was already used');
  }
}
