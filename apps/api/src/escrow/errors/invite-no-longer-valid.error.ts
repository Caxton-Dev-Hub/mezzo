import { DomainError } from '../../common/errors/domain-error';

export class InviteNoLongerValidError extends DomainError {
  readonly code = 'INVITE_NO_LONGER_VALID';
  readonly statusCode = 410;

  constructor(reason: 'used' | 'expired' | 'escrow_unavailable') {
    super(InviteNoLongerValidError.messageFor(reason), { reason });
  }

  private static messageFor(reason: 'used' | 'expired' | 'escrow_unavailable'): string {
    switch (reason) {
      case 'used':
        return 'This invite link has already been used';
      case 'expired':
        return 'This invite link has expired';
      case 'escrow_unavailable':
        return 'This escrow is no longer accepting a counterparty';
    }
  }
}
