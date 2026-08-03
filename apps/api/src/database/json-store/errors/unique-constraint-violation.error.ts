import { DomainError } from '../../../common/errors/domain-error';

export class UniqueConstraintViolationError extends DomainError {
  readonly code = 'UNIQUE_CONSTRAINT_VIOLATION';
  readonly statusCode = 409;

  constructor(table: string, fields: readonly string[]) {
    super(`A ${table} record with the same ${fields.join(' + ')} already exists`, {
      table,
      fields: [...fields],
    });
  }
}
