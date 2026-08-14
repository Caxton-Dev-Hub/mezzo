import { DomainError } from '../../common/errors/domain-error';

export class WhatsAppSessionExpiredError extends DomainError {
  readonly code = 'WHATSAPP_SESSION_EXPIRED';
  readonly statusCode = 410;

  constructor() {
    super('That confirmation has expired; start again');
  }
}
