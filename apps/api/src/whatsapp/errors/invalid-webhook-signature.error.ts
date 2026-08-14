import { DomainError } from '../../common/errors/domain-error';

export class InvalidWhatsAppWebhookSignatureError extends DomainError {
  readonly code = 'INVALID_WHATSAPP_WEBHOOK_SIGNATURE';
  readonly statusCode = 401;

  constructor() {
    super('WhatsApp webhook signature is missing or invalid');
  }
}
