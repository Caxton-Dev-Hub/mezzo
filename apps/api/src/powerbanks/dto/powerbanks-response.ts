import { Powerbank } from '../../database/entities/powerbank.entity';

export interface PowerbankDetailResponse {
  id: string;
  shopId: string;
  number: string;
  status: string;
  replacementPriceAmount: string;
  replacementPriceCurrency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PowerbankListResponse {
  items: PowerbankDetailResponse[];
}

export function toPowerbankDetailResponse(powerbank: Powerbank): PowerbankDetailResponse {
  return {
    id: powerbank.id,
    shopId: powerbank.shopId,
    number: powerbank.number,
    status: powerbank.status,
    replacementPriceAmount: powerbank.replacementPriceAmount,
    replacementPriceCurrency: powerbank.replacementPriceCurrency,
    createdAt: powerbank.createdAt,
    updatedAt: powerbank.updatedAt,
  };
}
