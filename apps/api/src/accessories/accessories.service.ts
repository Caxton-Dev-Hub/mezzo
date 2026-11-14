import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Accessory } from '../database/entities/accessory.entity';
import { AccessorySale } from '../database/entities/accessory-sale.entity';
import { AuditService } from '../audit/audit.service';
import { ShopsService } from '../shops/shops.service';
import { UserRole } from '../users/entities/user-role.enum';
import {
  AccessoryNotFoundError,
  InsufficientStockError,
  StaffNotAssignedToShopError,
} from './accessories.errors';
import {
  CreateAccessoryDto,
  UpdateAccessoryDto,
  RecordSaleDto,
} from './dto/accessories.schemas';

@Injectable()
export class AccessoriesService {
  constructor(
    @InjectRepository(Accessory)
    private readonly accessories: Repository<Accessory>,
    @InjectRepository(AccessorySale)
    private readonly accessorySales: Repository<AccessorySale>,
    private readonly shopsService: ShopsService,
    private readonly auditService: AuditService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async createAccessory(dto: CreateAccessoryDto): Promise<Accessory> {
    await this.shopsService.getShop(dto.shopId);

    const accessory = this.accessories.create({
      shopId: dto.shopId,
      name: dto.name,
      priceAmount: dto.priceAmount.toString(),
      priceCurrency: dto.priceCurrency,
      stockLevel: dto.stockLevel,
    });

    return this.accessories.save(accessory);
  }

  async updateAccessory(id: string, dto: UpdateAccessoryDto): Promise<Accessory> {
    const accessory = await this.accessories.findOne({ where: { id } });
    if (!accessory) {
      throw new AccessoryNotFoundError(id);
    }

    if (dto.name !== undefined) {
      accessory.name = dto.name;
    }
    if (dto.priceAmount !== undefined) {
      accessory.priceAmount = dto.priceAmount.toString();
    }
    if (dto.priceCurrency !== undefined) {
      accessory.priceCurrency = dto.priceCurrency;
    }
    if (dto.stockLevel !== undefined) {
      accessory.stockLevel = dto.stockLevel;
    }

    return this.accessories.save(accessory);
  }

  async listAccessories(shopId?: string): Promise<Accessory[]> {
    return this.accessories.find({
      where: shopId ? { shopId } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async recordSale(actorId: string, dto: RecordSaleDto): Promise<AccessorySale> {
    const accessory = await this.accessories.findOne({ where: { id: dto.accessoryId } });
    if (!accessory) {
      throw new AccessoryNotFoundError(dto.accessoryId);
    }

    const staffShopIds = await this.shopsService.getStaffShopIds(actorId);
    if (!staffShopIds.includes(accessory.shopId)) {
      throw new StaffNotAssignedToShopError(accessory.shopId);
    }

    return this.dataSource.transaction(async (manager) => {
      const lockedAccessory = await manager.findOne(Accessory, {
        where: { id: dto.accessoryId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedAccessory) {
        throw new AccessoryNotFoundError(dto.accessoryId);
      }

      if (lockedAccessory.stockLevel < dto.quantity) {
        throw new InsufficientStockError(dto.accessoryId, dto.quantity, lockedAccessory.stockLevel);
      }

      lockedAccessory.stockLevel -= dto.quantity;
      await manager.save(Accessory, lockedAccessory);

      const unitPrice = Number(lockedAccessory.priceAmount);
      const totalAmount = unitPrice * dto.quantity;

      const sale = await manager.save(
        AccessorySale,
        manager.create(AccessorySale, {
          accessoryId: dto.accessoryId,
          shopId: lockedAccessory.shopId,
          soldBy: actorId,
          quantity: dto.quantity,
          totalAmount: totalAmount.toString(),
          totalCurrency: lockedAccessory.priceCurrency,
          soldAt: new Date(),
        }),
      );

      await this.auditService.record(
        {
          actorId,
          action: 'accessory.sale_recorded',
          entityType: 'AccessorySale',
          entityId: sale.id,
          after: {
            accessoryId: dto.accessoryId,
            quantity: dto.quantity,
            totalAmount,
            currency: lockedAccessory.priceCurrency,
            newStockLevel: lockedAccessory.stockLevel,
          },
        },
        manager,
      );

      return sale;
    });
  }

  async listSales(
    _actorId: string,
    role: UserRole,
    allowedShopIds: string[] | null,
  ): Promise<AccessorySale[]> {
    if (role === UserRole.ADMIN) {
      return this.accessorySales.find({ order: { soldAt: 'DESC' } });
    }

    if (role === UserRole.STAFF && allowedShopIds && allowedShopIds.length > 0) {
      return this.accessorySales.find({
        where: { shopId: In(allowedShopIds) },
        order: { soldAt: 'DESC' },
      });
    }

    return [];
  }
}
