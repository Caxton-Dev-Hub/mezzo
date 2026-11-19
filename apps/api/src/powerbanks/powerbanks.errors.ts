import { NotFoundException, BadRequestException } from '@nestjs/common';

export class PowerbankNotFoundError extends NotFoundException {
  constructor(powerbankId: string) {
    super(`Powerbank ${powerbankId} not found`);
  }
}

export class PowerbankNumberInUseError extends BadRequestException {
  constructor(shopId: string, number: string) {
    super(`Powerbank number ${number} is already in use at shop ${shopId}`);
  }
}

export class InvalidPowerbankNumberError extends BadRequestException {
  constructor(number: string) {
    super(`Invalid powerbank number: ${number}. Must be between 1 and 99`);
  }
}
