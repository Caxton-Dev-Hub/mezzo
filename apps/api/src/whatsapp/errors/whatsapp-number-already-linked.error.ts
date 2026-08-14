import { DomainError } from '../../common/errors/domain-error';

export class WhatsAppNumberAlreadyLinkedError extends DomainError {
  readonly code = 'WHATSAPP_NUMBER_ALREADY_LINKED';
  readonly statusCode = 409;

  constructor() {
    super('This WhatsApp number is already linked to another account');
  }
}
