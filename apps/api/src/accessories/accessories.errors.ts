import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

export class AccessoryNotFoundError extends NotFoundException {
  constructor(accessoryId: string) {
    super(`Accessory ${accessoryId} not found`);
  }
}

export class InsufficientStockError extends BadRequestException {
  constructor(accessoryId: string, requested: number, available: number) {
    super(`Insufficient stock for accessory ${accessoryId}: requested ${requested}, available ${available}`);
  }
}

export class StaffNotAssignedToShopError extends ForbiddenException {
  constructor(shopId: string) {
    super(`Staff member is not assigned to shop ${shopId}`);
  }
}
