import { DomainError } from '../../common/errors/domain-error';

export class MissingCreationEvidenceError extends DomainError {
  readonly code = 'MISSING_CREATION_EVIDENCE';
  readonly statusCode = 409;

  constructor() {
    super('At least one AT_CREATION photo is required before inviting a counterparty');
  }
}
