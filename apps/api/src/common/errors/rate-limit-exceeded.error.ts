import { DomainError } from './domain-error';

export class RateLimitExceededError extends DomainError {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly statusCode = 429;

  constructor() {
    super('Too many requests, please try again later');
  }
}
