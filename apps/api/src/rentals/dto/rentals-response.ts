import { Rental, RentalStatus } from '../../database/entities/rental.entity';

export interface RentalDetailResponse {
  id: string;
  powerbankId: string;
  userId: string;
  shopId: string;
  startedAt: string;
  dueAt: string;
  returnedAt: string | null;
  status: RentalStatus;
  baseChargeAmount: string;
  baseChargeCurrency: string;
  totalChargedAmount: string;
  totalChargedCurrency: string;
}

export interface RentalListResponse {
  rentals: RentalDetailResponse[];
}

export interface CheckoutResponse {
  rental: RentalDetailResponse;
}

export function toRentalDetailResponse(rental: Rental): RentalDetailResponse {
  return {
    id: rental.id,
    powerbankId: rental.powerbankId,
    userId: rental.userId,
    shopId: rental.shopId,
    startedAt: rental.startedAt.toISOString(),
    dueAt: rental.dueAt.toISOString(),
    returnedAt: rental.returnedAt ? rental.returnedAt.toISOString() : null,
    status: rental.status,
    baseChargeAmount: rental.baseChargeAmount,
    baseChargeCurrency: rental.baseChargeCurrency,
    totalChargedAmount: rental.totalChargedAmount,
    totalChargedCurrency: rental.totalChargedCurrency,
  };
}
