import { DomainError } from '../../common/errors/domain-error';

export class InvalidWebhookSignatureError extends DomainError {
  readonly code = 'INVALID_WEBHOOK_SIGNATURE';
  readonly statusCode = 401;

  constructor() {
    super('Webhook signature is missing or invalid');
  }
}
