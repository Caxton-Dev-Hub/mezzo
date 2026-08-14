import { DomainError } from '../../common/errors/domain-error';

export class WhatsAppPinNotSetError extends DomainError {
  readonly code = 'WHATSAPP_PIN_NOT_SET';
  readonly statusCode = 409;

  constructor() {
    super('Set a PIN before releasing funds or approving delivery over WhatsApp');
  }
}
