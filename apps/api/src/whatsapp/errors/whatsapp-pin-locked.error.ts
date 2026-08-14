import { DomainError } from '../../common/errors/domain-error';

export class WhatsAppPinLockedError extends DomainError {
  readonly code = 'WHATSAPP_PIN_LOCKED';
  readonly statusCode = 423;

  constructor(readonly lockedUntil: Date) {
    super('Too many incorrect PIN attempts; try again later', { lockedUntil });
  }
}
