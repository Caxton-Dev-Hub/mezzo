import { DomainError } from '../../common/errors/domain-error';

export class EvidenceObjectNotFoundError extends DomainError {
  readonly code = 'EVIDENCE_OBJECT_NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('No uploaded object was found for this storage key; upload it before confirming');
  }
}
