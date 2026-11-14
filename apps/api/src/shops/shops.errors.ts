import { HttpStatus } from '@nestjs/common';

export class ShopNotFoundError extends Error {
  constructor(shopId?: string) {
    super(shopId ? `Shop with id ${shopId} not found` : 'Shop not found');
    this.name = 'ShopNotFoundError';
  }

  readonly statusCode = HttpStatus.NOT_FOUND;
}

export class VerificationNotFoundError extends Error {
  constructor(verificationId?: string) {
    super(
      verificationId
        ? `Verification with id ${verificationId} not found`
        : 'Verification not found',
    );
    this.name = 'VerificationNotFoundError';
  }

  readonly statusCode = HttpStatus.NOT_FOUND;
}

export class VerificationNotPendingError extends Error {
  constructor() {
    super('Verification is not in PENDING status and cannot be reviewed');
    this.name = 'VerificationNotPendingError';
  }

  readonly statusCode = HttpStatus.CONFLICT;
}

export class VerificationAlreadyExistsError extends Error {
  constructor() {
    super('User already has a PENDING or APPROVED verification submission');
    this.name = 'VerificationAlreadyExistsError';
  }

  readonly statusCode = HttpStatus.CONFLICT;
}

export class StaffNotAssignedError extends Error {
  constructor(userId?: string, shopId?: string) {
    super(
      userId && shopId
        ? `Staff user ${userId} is not assigned to shop ${shopId}`
        : 'Staff user is not assigned to the specified shop',
    );
    this.name = 'StaffNotAssignedError';
  }

  readonly statusCode = HttpStatus.FORBIDDEN;
}
