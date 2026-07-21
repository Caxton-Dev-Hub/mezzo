import { DomainError } from '../../common/errors/domain-error';

export class InviteNotFoundError extends DomainError {
  readonly code = 'INVITE_NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('This invite link does not exist');
  }
}
