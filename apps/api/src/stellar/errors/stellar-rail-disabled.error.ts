import { DomainError } from '../../common/errors/domain-error';

export class StellarRailDisabledError extends DomainError {
  readonly code = 'STELLAR_RAIL_DISABLED';
  readonly statusCode = 503;

  constructor() {
    super('The Stellar rail is not enabled on this deployment');
  }
}
