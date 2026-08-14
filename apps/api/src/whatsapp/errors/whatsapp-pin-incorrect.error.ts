import { DomainError } from '../../common/errors/domain-error';

export class WhatsAppPinIncorrectError extends DomainError {
  readonly code = 'WHATSAPP_PIN_INCORRECT';
  readonly statusCode = 401;

  constructor(readonly attemptsRemaining: number) {
    super('Incorrect PIN', { attemptsRemaining });
  }
}
