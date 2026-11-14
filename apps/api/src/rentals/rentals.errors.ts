import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

export class RentalNotFoundError extends NotFoundException {
  constructor(rentalId: string) {
    super(`Rental ${rentalId} not found`);
  }
}

export class PowerbankNotAvailableError extends BadRequestException {
  constructor(powerbankId: string) {
    super(`Powerbank ${powerbankId} is not available for rental`);
  }
}

export class UserNotVerifiedError extends ForbiddenException {
  constructor() {
    super('User must have an approved verification to rent a powerbank');
  }
}

export class OutstandingBalanceExistsError extends BadRequestException {
  constructor() {
    super('Cannot rent with outstanding balance. Please fund your wallet to clear existing charges');
  }
}

export class RentalNotActiveError extends BadRequestException {
  constructor(rentalId: string) {
    super(`Rental ${rentalId} is not in an active state`);
  }
}

export class ReplacementChargeNotFoundError extends NotFoundException {
  constructor(rentalId: string) {
    super(`No replacement charge found for rental ${rentalId}`);
  }
}
