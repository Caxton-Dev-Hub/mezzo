import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { PowerbanksService } from './powerbanks.service';
import { Powerbank, PowerbankStatus } from '../database/entities/powerbank.entity';
import { AuditService } from '../audit/audit.service';
import { ShopsService } from '../shops/shops.service';
import {
  PowerbankNotFoundError,
  PowerbankNumberInUseError,
  InvalidPowerbankNumberError,
} from './powerbanks.errors';

describe('PowerbanksService', () => {
  let service: PowerbanksService;
  let powerbanksRepo: jest.Mocked<Repository<Powerbank>>;
  let shopsService: jest.Mocked<ShopsService>;
  let auditService: jest.Mocked<AuditService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PowerbanksService,
        {
          provide: getRepositoryToken(Powerbank),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: ShopsService,
          useValue: {
            getShop: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            record: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PowerbanksService>(PowerbanksService);
    powerbanksRepo = module.get(getRepositoryToken(Powerbank));
    shopsService = module.get(ShopsService);
    auditService = module.get(AuditService);
  });

  describe('createPowerbank', () => {
    it('should throw InvalidPowerbankNumberError if number is not 1-99', async () => {
      const dto = { shopId: 'shop-id', number: '100' };

      shopsService.getShop.mockResolvedValue({} as never);

      await expect(service.createPowerbank(dto)).rejects.toThrow(InvalidPowerbankNumberError);
    });

    it('should throw PowerbankNumberInUseError if number already exists for shop', async () => {
      const dto = { shopId: 'shop-id', number: '5' };

      shopsService.getShop.mockResolvedValue({} as never);
      powerbanksRepo.create.mockReturnValue({
        shopId: dto.shopId,
        number: dto.number,
        status: PowerbankStatus.AVAILABLE,
        replacementPriceAmount: '1500000',
        replacementPriceCurrency: 'NGN',
      } as Powerbank);

      const uniqueError = new QueryFailedError('INSERT', [], new Error('unique constraint'));
      Object.defineProperty(uniqueError, 'message', {
        value: 'duplicate key value violates unique constraint',
      });

      powerbanksRepo.save.mockRejectedValue(uniqueError);

      await expect(service.createPowerbank(dto)).rejects.toThrow(PowerbankNumberInUseError);
    });

    it('should create powerbank with default replacement price', async () => {
      const dto = { shopId: 'shop-id', number: '7' };
      const powerbank = {
        id: 'powerbank-id',
        shopId: dto.shopId,
        number: dto.number,
        status: PowerbankStatus.AVAILABLE,
        replacementPriceAmount: '1500000',
        replacementPriceCurrency: 'NGN',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Powerbank;

      shopsService.getShop.mockResolvedValue({} as never);
      powerbanksRepo.create.mockReturnValue(powerbank);
      powerbanksRepo.save.mockResolvedValue(powerbank);

      const result = await service.createPowerbank(dto);

      expect(result).toEqual(powerbank);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(powerbanksRepo.create).toHaveBeenCalledWith({
        shopId: dto.shopId,
        number: dto.number,
        status: PowerbankStatus.AVAILABLE,
        replacementPriceAmount: '1500000',
        replacementPriceCurrency: 'NGN',
      });
    });
  });

  describe('listPowerbanks', () => {
    it('should return all powerbanks when no shopId provided', async () => {
      const powerbanks = [
        { id: 'pb-1', number: '1', status: PowerbankStatus.AVAILABLE },
        { id: 'pb-2', number: '2', status: PowerbankStatus.RENTED },
      ] as Powerbank[];

      powerbanksRepo.find.mockResolvedValue(powerbanks);

      const result = await service.listPowerbanks();

      expect(result).toEqual(powerbanks);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(powerbanksRepo.find).toHaveBeenCalledWith({
        where: {},
        order: { number: 'ASC' },
      });
    });

    it('should filter by shopId when provided', async () => {
      const powerbanks = [{ id: 'pb-1', shopId: 'shop-1', number: '1' }] as Powerbank[];

      powerbanksRepo.find.mockResolvedValue(powerbanks);

      const result = await service.listPowerbanks('shop-1');

      expect(result).toEqual(powerbanks);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(powerbanksRepo.find).toHaveBeenCalledWith({
        where: { shopId: 'shop-1' },
        order: { number: 'ASC' },
      });
    });
  });

  describe('listAvailablePowerbanks', () => {
    it('should return only AVAILABLE powerbanks', async () => {
      const powerbanks = [
        { id: 'pb-1', number: '1', status: PowerbankStatus.AVAILABLE },
      ] as Powerbank[];

      powerbanksRepo.find.mockResolvedValue(powerbanks);

      const result = await service.listAvailablePowerbanks();

      expect(result).toEqual(powerbanks);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(powerbanksRepo.find).toHaveBeenCalledWith({
        where: { status: PowerbankStatus.AVAILABLE },
        order: { number: 'ASC' },
      });
    });
  });

  describe('markAvailable', () => {
    it('should throw PowerbankNotFoundError if powerbank does not exist', async () => {
      powerbanksRepo.findOne.mockResolvedValue(null);

      await expect(service.markAvailable('pb-id', 'actor-id')).rejects.toThrow(
        PowerbankNotFoundError,
      );
    });

    it('should update status to AVAILABLE and record audit', async () => {
      const powerbank = {
        id: 'pb-id',
        number: '5',
        status: PowerbankStatus.MAINTENANCE,
      } as Powerbank;

      const updated = {
        ...powerbank,
        status: PowerbankStatus.AVAILABLE,
      } as Powerbank;

      powerbanksRepo.findOne.mockResolvedValue(powerbank);
      powerbanksRepo.save.mockResolvedValue(updated);
      auditService.record.mockResolvedValue({} as never);

      const result = await service.markAvailable('pb-id', 'actor-id');

      expect(result.status).toBe(PowerbankStatus.AVAILABLE);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: 'actor-id',
        action: 'powerbank.mark_available',
        entityType: 'Powerbank',
        entityId: 'pb-id',
        before: { status: PowerbankStatus.MAINTENANCE },
        after: { status: PowerbankStatus.AVAILABLE },
      });
    });
  });

  describe('markMaintenance', () => {
    it('should throw PowerbankNotFoundError if powerbank does not exist', async () => {
      powerbanksRepo.findOne.mockResolvedValue(null);

      await expect(service.markMaintenance('pb-id', 'actor-id')).rejects.toThrow(
        PowerbankNotFoundError,
      );
    });

    it('should update status to MAINTENANCE and record audit', async () => {
      const powerbank = {
        id: 'pb-id',
        number: '3',
        status: PowerbankStatus.AVAILABLE,
      } as Powerbank;

      const updated = {
        ...powerbank,
        status: PowerbankStatus.MAINTENANCE,
      } as Powerbank;

      powerbanksRepo.findOne.mockResolvedValue(powerbank);
      powerbanksRepo.save.mockResolvedValue(updated);
      auditService.record.mockResolvedValue({} as never);

      const result = await service.markMaintenance('pb-id', 'actor-id');

      expect(result.status).toBe(PowerbankStatus.MAINTENANCE);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: 'actor-id',
        action: 'powerbank.mark_maintenance',
        entityType: 'Powerbank',
        entityId: 'pb-id',
        before: { status: PowerbankStatus.AVAILABLE },
        after: { status: PowerbankStatus.MAINTENANCE },
      });
    });
  });

  describe('markLost', () => {
    it('should throw PowerbankNotFoundError if powerbank does not exist', async () => {
      powerbanksRepo.findOne.mockResolvedValue(null);

      await expect(service.markLost('pb-id', 'actor-id')).rejects.toThrow(
        PowerbankNotFoundError,
      );
    });

    it('should update status to LOST and record audit', async () => {
      const powerbank = {
        id: 'pb-id',
        number: '2',
        status: PowerbankStatus.AVAILABLE,
        shopId: 'shop-1',
      } as Powerbank;

      const updated = {
        ...powerbank,
        status: PowerbankStatus.LOST,
      } as Powerbank;

      powerbanksRepo.findOne.mockResolvedValue(powerbank);
      powerbanksRepo.save.mockResolvedValue(updated);
      auditService.record.mockResolvedValue({} as never);

      const result = await service.markLost('pb-id', 'actor-id');

      expect(result.status).toBe(PowerbankStatus.LOST);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: 'actor-id',
        action: 'powerbank.mark_lost',
        entityType: 'Powerbank',
        entityId: 'pb-id',
        before: { status: PowerbankStatus.AVAILABLE, shopId: 'shop-1' },
        after: { status: PowerbankStatus.LOST, shopId: 'shop-1' },
      });
    });
  });

  describe('markUnreturned', () => {
    it('should throw PowerbankNotFoundError if powerbank does not exist', async () => {
      powerbanksRepo.findOne.mockResolvedValue(null);

      await expect(service.markUnreturned('pb-id', 'actor-id')).rejects.toThrow(
        PowerbankNotFoundError,
      );
    });

    it('should update status to UNRETURNED and record audit', async () => {
      const powerbank = {
        id: 'pb-id',
        number: '4',
        status: PowerbankStatus.RENTED,
        shopId: 'shop-2',
      } as Powerbank;

      const updated = {
        ...powerbank,
        status: PowerbankStatus.UNRETURNED,
      } as Powerbank;

      powerbanksRepo.findOne.mockResolvedValue(powerbank);
      powerbanksRepo.save.mockResolvedValue(updated);
      auditService.record.mockResolvedValue({} as never);

      const result = await service.markUnreturned('pb-id', 'actor-id');

      expect(result.status).toBe(PowerbankStatus.UNRETURNED);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: 'actor-id',
        action: 'powerbank.mark_unreturned',
        entityType: 'Powerbank',
        entityId: 'pb-id',
        before: { status: PowerbankStatus.RENTED, shopId: 'shop-2' },
        after: { status: PowerbankStatus.UNRETURNED, shopId: 'shop-2' },
      });
    });
  });
});
