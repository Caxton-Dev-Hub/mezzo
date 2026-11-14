import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AccessoriesService } from './accessories.service';
import { Accessory } from '../database/entities/accessory.entity';
import { AccessorySale } from '../database/entities/accessory-sale.entity';
import { StaffAssignment } from '../database/entities/staff-assignment.entity';
import { AuditService } from '../audit/audit.service';
import { ShopsService } from '../shops/shops.service';
import { UserRole } from '../users/entities/user-role.enum';
import {
  InsufficientStockError,
  StaffNotAssignedToShopError,
} from './accessories.errors';

describe('AccessoriesService', () => {
  let service: AccessoriesService;
  let accessoriesRepo: jest.Mocked<Repository<Accessory>>;
  let accessorySalesRepo: jest.Mocked<Repository<AccessorySale>>;
  let shopsService: jest.Mocked<ShopsService>;
  let auditService: jest.Mocked<AuditService>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    const mockManager = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessoriesService,
        {
          provide: getRepositoryToken(Accessory),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AccessorySale),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(StaffAssignment),
          useValue: {},
        },
        {
          provide: ShopsService,
          useValue: {
            getShop: jest.fn(),
            getStaffShopIds: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            record: jest.fn(),
          },
        },
        {
          provide: getDataSourceToken(),
          useValue: {
            transaction: jest.fn((cb) => cb(mockManager)),
          },
        },
      ],
    }).compile();

    service = module.get<AccessoriesService>(AccessoriesService);
    accessoriesRepo = module.get(getRepositoryToken(Accessory));
    accessorySalesRepo = module.get(getRepositoryToken(AccessorySale));
    shopsService = module.get(ShopsService);
    auditService = module.get(AuditService);
    dataSource = module.get(getDataSourceToken());
  });

  describe('recordSale', () => {
    it('should throw StaffNotAssignedToShopError if actorId not assigned to accessory shop', async () => {
      const actorId = 'staff-id';
      const dto = { accessoryId: 'accessory-id', quantity: 2 };
      const accessory = {
        id: 'accessory-id',
        shopId: 'shop-1',
        name: 'Cable',
        priceAmount: '1000',
        priceCurrency: 'NGN',
        stockLevel: 10,
      } as Accessory;

      accessoriesRepo.findOne.mockResolvedValue(accessory);
      shopsService.getStaffShopIds.mockResolvedValue(['shop-2', 'shop-3']);

      await expect(service.recordSale(actorId, dto)).rejects.toThrow(
        StaffNotAssignedToShopError,
      );
    });

    it('should throw InsufficientStockError if quantity exceeds stockLevel', async () => {
      const actorId = 'staff-id';
      const dto = { accessoryId: 'accessory-id', quantity: 15 };
      const accessory = {
        id: 'accessory-id',
        shopId: 'shop-1',
        name: 'Cable',
        priceAmount: '1000',
        priceCurrency: 'NGN',
        stockLevel: 10,
      } as Accessory;

      accessoriesRepo.findOne.mockResolvedValue(accessory);
      shopsService.getStaffShopIds.mockResolvedValue(['shop-1']);

      const mockManager = {
        findOne: jest.fn().mockResolvedValue({ ...accessory }),
        save: jest.fn(),
        create: jest.fn() as any,
      };

      dataSource.transaction.mockImplementation((cb: any) => cb(mockManager));

      await expect(service.recordSale(actorId, dto)).rejects.toThrow(InsufficientStockError);
    });

    it('should decrement stock and create AccessorySale when valid', async () => {
      const actorId = 'staff-id';
      const dto = { accessoryId: 'accessory-id', quantity: 3 };
      const accessory = {
        id: 'accessory-id',
        shopId: 'shop-1',
        name: 'Cable',
        priceAmount: '1000',
        priceCurrency: 'NGN',
        stockLevel: 10,
      } as Accessory;

      const sale = {
        id: 'sale-id',
        accessoryId: dto.accessoryId,
        shopId: accessory.shopId,
        soldBy: actorId,
        quantity: dto.quantity,
        totalAmount: '3000',
        totalCurrency: 'NGN',
        soldAt: new Date(),
      } as AccessorySale;

      accessoriesRepo.findOne.mockResolvedValue(accessory);
      shopsService.getStaffShopIds.mockResolvedValue(['shop-1']);

      const lockedAccessory = { ...accessory };
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(lockedAccessory),
        save: jest.fn().mockImplementation((_entity: any, data: any) => Promise.resolve(data || lockedAccessory)),
        create: jest.fn().mockReturnValue(sale) as any,
      };

      dataSource.transaction.mockImplementation((cb: any) => cb(mockManager));
      auditService.record.mockResolvedValue({} as never);

      const result = await service.recordSale(actorId, dto);

      expect(result).toEqual(sale);
      expect(lockedAccessory.stockLevel).toBe(7);
      expect(mockManager.save).toHaveBeenCalledWith(Accessory, lockedAccessory);
      expect(mockManager.create).toHaveBeenCalledWith(
        AccessorySale,
        expect.objectContaining({
          accessoryId: dto.accessoryId,
          soldBy: actorId,
          quantity: dto.quantity,
          totalAmount: '3000',
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId,
          action: 'accessory.sale_recorded',
          entityType: 'AccessorySale',
        }),
        mockManager,
      );
    });
  });

  describe('listSales', () => {
    it('should return all sales for ADMIN', async () => {
      const sales = [
        { id: 'sale-1', shopId: 'shop-1' },
        { id: 'sale-2', shopId: 'shop-2' },
      ] as AccessorySale[];

      accessorySalesRepo.find.mockResolvedValue(sales);

      const result = await service.listSales('admin-id', UserRole.ADMIN, null);

      expect(result).toEqual(sales);
      expect(accessorySalesRepo.find).toHaveBeenCalledWith({
        order: { soldAt: 'DESC' },
      });
    });

    it('should filter sales by allowedShopIds for STAFF', async () => {
      const sales = [{ id: 'sale-1', shopId: 'shop-1' }] as AccessorySale[];

      accessorySalesRepo.find.mockResolvedValue(sales);

      const result = await service.listSales('staff-id', UserRole.STAFF, ['shop-1', 'shop-2']);

      expect(result).toEqual(sales);
      expect(accessorySalesRepo.find).toHaveBeenCalledWith({
        where: { shopId: expect.anything() },
        order: { soldAt: 'DESC' },
      });
    });

    it('should return empty array for STAFF with no allowedShopIds', async () => {
      const result = await service.listSales('staff-id', UserRole.STAFF, []);

      expect(result).toEqual([]);
    });
  });
});
