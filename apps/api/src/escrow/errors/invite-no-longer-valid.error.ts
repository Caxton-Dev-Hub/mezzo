import { DomainError } from '../../common/errors/domain-error';

export class InviteNoLongerValidError extends DomainError {
  readonly code = 'INVITE_NO_LONGER_VALID';
  readonly statusCode = 410;

  constructor(reason: 'used' | 'expired') {
    super(
      reason === 'used'
        ? 'This invite link has already been used'
        : 'This invite link has expired',
      { reason },
    );
  }
}
