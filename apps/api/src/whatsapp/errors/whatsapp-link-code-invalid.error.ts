import { DomainError } from '../../common/errors/domain-error';

export class WhatsAppLinkCodeInvalidError extends DomainError {
  readonly code = 'WHATSAPP_LINK_CODE_INVALID';
  readonly statusCode = 400;

  constructor() {
    super('That linking code is invalid or has expired');
  }
}
