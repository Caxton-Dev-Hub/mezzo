export enum PowerbankStatus {
  AVAILABLE = 'AVAILABLE',
  RENTED = 'RENTED',
  OVERDUE = 'OVERDUE',
  UNRETURNED = 'UNRETURNED',
  LOST = 'LOST',
  MAINTENANCE = 'MAINTENANCE',
}

export interface PowerbankDto {
  id: string;
  shopId: string;
  number: string;
  status: PowerbankStatus;
  replacementPriceAmount: string;
  replacementPriceCurrency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePowerbankDto {
  shopId: string;
  number: string;
}

export interface PowerbankListResponse {
  items: PowerbankDto[];
}
