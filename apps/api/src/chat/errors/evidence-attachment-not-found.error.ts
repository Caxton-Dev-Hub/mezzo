import { DomainError } from '../../common/errors/domain-error';

export class EvidenceAttachmentNotFoundError extends DomainError {
  readonly code = 'EVIDENCE_ATTACHMENT_NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('The referenced evidence item does not belong to this escrow');
  }
}
