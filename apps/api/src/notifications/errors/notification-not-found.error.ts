import { DomainError } from '../../common/errors/domain-error';

export class NotificationNotFoundError extends DomainError {
  readonly code = 'NOTIFICATION_NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('Notification not found');
  }
}
