import { Accessory } from '../../database/entities/accessory.entity';
import { AccessorySale } from '../../database/entities/accessory-sale.entity';

export interface AccessoryDetailResponse {
  id: string;
  shopId: string;
  name: string;
  priceAmount: string;
  priceCurrency: string;
  stockLevel: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccessoryListResponse {
  items: AccessoryDetailResponse[];
}

export interface SaleDetailResponse {
  id: string;
  accessoryId: string;
  shopId: string;
  soldBy: string;
  quantity: number;
  totalAmount: string;
  totalCurrency: string;
  soldAt: Date;
}

export interface SaleListResponse {
  items: SaleDetailResponse[];
}

export function toAccessoryDetailResponse(accessory: Accessory): AccessoryDetailResponse {
  return {
    id: accessory.id,
    shopId: accessory.shopId,
    name: accessory.name,
    priceAmount: accessory.priceAmount,
    priceCurrency: accessory.priceCurrency,
    stockLevel: accessory.stockLevel,
    createdAt: accessory.createdAt,
    updatedAt: accessory.updatedAt,
  };
}

export function toSaleDetailResponse(sale: AccessorySale): SaleDetailResponse {
  return {
    id: sale.id,
    accessoryId: sale.accessoryId,
    shopId: sale.shopId,
    soldBy: sale.soldBy,
    quantity: sale.quantity,
    totalAmount: sale.totalAmount,
    totalCurrency: sale.totalCurrency,
    soldAt: sale.soldAt,
  };
}
