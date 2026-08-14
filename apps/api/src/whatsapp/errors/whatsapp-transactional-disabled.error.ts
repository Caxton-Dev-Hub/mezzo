import { DomainError } from '../../common/errors/domain-error';

export class WhatsAppTransactionalDisabledError extends DomainError {
  readonly code = 'WHATSAPP_TRANSACTIONAL_DISABLED';
  readonly statusCode = 503;

  constructor() {
    super('Money-moving commands are temporarily disabled over WhatsApp');
  }
}
