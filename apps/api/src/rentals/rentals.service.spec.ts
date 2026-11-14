/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RentalsService } from './rentals.service';
import { Rental, RentalStatus } from '../database/entities/rental.entity';
import { RentalCharge, RentalChargeType } from '../database/entities/rental-charge.entity';
import { Powerbank, PowerbankStatus } from '../database/entities/powerbank.entity';
import {
  OutstandingBalance,
  OutstandingBalanceReason,
} from '../database/entities/outstanding-balance.entity';
import {
  VerificationSubmission,
  VerificationSubmissionStatus,
} from '../database/entities/verification-submission.entity';
import { LedgerService } from '../ledger/ledger.service';
// @ts-expect-error - used in type annotation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { LedgerPosting } from '../database/entities/ledger-posting.entity';
import { AuditService } from '../audit/audit.service';
import { Money } from '../common/money/money';
import {
  UserNotVerifiedError,
  OutstandingBalanceExistsError,
  PowerbankNotAvailableError,
} from './rentals.errors';
import {
  BASE_RATE_KOBO,
  HOURLY_OVERAGE_KOBO,
  MAX_OVERAGE_KOBO,
} from './entities/pricing.constants';

describe('RentalsService', () => {
  let service: RentalsService;
  let rentalsRepo: jest.Mocked<Repository<Rental>>;
  let outstandingBalancesRepo: jest.Mocked<Repository<OutstandingBalance>>;
  let verificationsRepo: jest.Mocked<Repository<VerificationSubmission>>;
  let ledgerService: jest.Mocked<LedgerService>;
  let auditService: jest.Mocked<AuditService>;

  const mockEntityManager = {
    findOne: jest.fn() as jest.MockedFunction<(entity: unknown, options?: unknown) => Promise<unknown>>,
    find: jest.fn() as jest.MockedFunction<(entity: unknown, options?: unknown) => Promise<unknown[]>>,
    save: jest.fn() as jest.MockedFunction<(entity: unknown, data: unknown) => Promise<unknown>>,
    create: jest.fn() as jest.MockedFunction<(entity: unknown, data?: unknown) => unknown>,
    getRepository: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RentalsService,
        {
          provide: getRepositoryToken(Rental),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RentalCharge),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Powerbank),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(OutstandingBalance),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(VerificationSubmission),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: LedgerService,
          useValue: {
            postTransaction: jest.fn(),
            getBalanceOrZero: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            record: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation(async (callback: (manager: typeof mockEntityManager) => Promise<unknown>) => {
              return callback(mockEntityManager);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RentalsService>(RentalsService);
    rentalsRepo = module.get(getRepositoryToken(Rental));
    outstandingBalancesRepo = module.get(getRepositoryToken(OutstandingBalance));
    verificationsRepo = module.get(getRepositoryToken(VerificationSubmission));
    ledgerService = module.get(LedgerService);
    auditService = module.get(AuditService);

    jest.clearAllMocks();
  });

  describe('checkout', () => {
    const userId = 'user-id';
    const dto = { powerbankId: 'pb-id', shopId: 'shop-id' };

    it('should throw UserNotVerifiedError if user lacks APPROVED verification', async () => {
      verificationsRepo.findOne.mockResolvedValue(null);

      await expect(service.checkout(userId, dto)).rejects.toThrow(UserNotVerifiedError);
    });

    it('should throw OutstandingBalanceExistsError if user has uncleared balances', async () => {
      verificationsRepo.findOne.mockResolvedValue({
        id: 'v1',
        userId,
        status: VerificationSubmissionStatus.APPROVED,
      } as VerificationSubmission);

      outstandingBalancesRepo.find.mockResolvedValue([
        {
          id: 'ob1',
          userId,
          amount: '5000',
          currency: 'NGN',
          reason: OutstandingBalanceReason.RENTAL_OVERAGE,
          clearedAt: null,
        } as OutstandingBalance,
      ]);

      await expect(service.checkout(userId, dto)).rejects.toThrow(OutstandingBalanceExistsError);
    });

    it('should charge BASE_RATE_KOBO from wallet and create rental', async () => {
      verificationsRepo.findOne.mockResolvedValue({
        id: 'v1',
        userId,
        status: VerificationSubmissionStatus.APPROVED,
      } as VerificationSubmission);

      outstandingBalancesRepo.find.mockResolvedValue([]);

      const powerbank = {
        id: 'pb-id',
        status: PowerbankStatus.AVAILABLE,
        shopId: 'shop-id',
      } as Powerbank;

      const rental = {
        id: 'rental-id',
        powerbankId: dto.powerbankId,
        userId,
        shopId: dto.shopId,
        status: RentalStatus.ACTIVE,
        baseChargeAmount: BASE_RATE_KOBO.toString(),
        baseChargeCurrency: 'NGN',
        totalChargedAmount: BASE_RATE_KOBO.toString(),
        totalChargedCurrency: 'NGN',
        startedAt: new Date(),
        dueAt: new Date(),
      } as Rental;

      mockEntityManager.findOne.mockResolvedValue(powerbank);
      mockEntityManager.save.mockResolvedValue(rental);
      mockEntityManager.create.mockReturnValue(rental);
      ledgerService.postTransaction.mockResolvedValue({ id: 'posting-id', createdAt: new Date(), idempotencyKey: 'key', correlationId: null });

      const result = await service.checkout(userId, dto);

      expect(result).toEqual(rental);
      expect(ledgerService.postTransaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            accountRef: `user:${userId}:wallet:NGN`,
            money: Money.of(BASE_RATE_KOBO, 'NGN'),
          }),
          expect.objectContaining({
            accountRef: expect.stringContaining('holding:rental:'),
          }),
        ]),
        expect.objectContaining({
          idempotencyKey: expect.stringContaining('rental-base:'),
        }),
        mockEntityManager,
      );
    });

    it('should throw PowerbankNotAvailableError if powerbank is not AVAILABLE', async () => {
      verificationsRepo.findOne.mockResolvedValue({
        id: 'v1',
        userId,
        status: VerificationSubmissionStatus.APPROVED,
      } as VerificationSubmission);

      outstandingBalancesRepo.find.mockResolvedValue([]);

      mockEntityManager.findOne.mockResolvedValue({
        id: 'pb-id',
        status: PowerbankStatus.RENTED,
      });

      await expect(service.checkout(userId, dto)).rejects.toThrow(PowerbankNotAvailableError);
    });
  });

  describe('runOverdueAccrual', () => {
    it('should post 2500 kobo at 1 hour overdue', async () => {
      const oneHourAgo = new Date(Date.now() - 3600000);
      const rental = {
        id: 'rental-id',
        userId: 'user-id',
        powerbankId: 'pb-id',
        status: RentalStatus.ACTIVE,
        dueAt: oneHourAgo,
        totalChargedAmount: BASE_RATE_KOBO.toString(),
      } as Rental;

      rentalsRepo.find.mockResolvedValue([rental]);
      mockEntityManager.findOne.mockResolvedValue(rental);
      mockEntityManager.find.mockResolvedValue([]);
      mockEntityManager.save.mockResolvedValue(rental);
      mockEntityManager.create.mockImplementation((_entity: unknown, data: unknown) => data as RentalCharge);
      ledgerService.getBalanceOrZero.mockResolvedValue({ amount: 100000, currency: 'NGN' });
      ledgerService.postTransaction.mockResolvedValue({ id: 'posting-id', createdAt: new Date(), idempotencyKey: 'key', correlationId: null });

      await service.runOverdueAccrual();

      expect(ledgerService.postTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          idempotencyKey: 'rental-overage:rental-id:1',
        }),
        mockEntityManager,
      );
    });

    it('should post 30000 kobo at 12 hours overdue', async () => {
      const twelveHoursAgo = new Date(Date.now() - 12 * 3600000);
      const rental = {
        id: 'rental-id',
        userId: 'user-id',
        powerbankId: 'pb-id',
        status: RentalStatus.OVERDUE,
        dueAt: twelveHoursAgo,
        totalChargedAmount: BASE_RATE_KOBO.toString(),
      } as Rental;

      rentalsRepo.find.mockResolvedValue([rental]);
      mockEntityManager.findOne.mockResolvedValue(rental);
      mockEntityManager.find.mockResolvedValue([]);
      mockEntityManager.save.mockResolvedValue(rental);
      mockEntityManager.create.mockImplementation((_entity: unknown, data: unknown) => data as RentalCharge);
      ledgerService.getBalanceOrZero.mockResolvedValue({ amount: 100000, currency: 'NGN' });
      ledgerService.postTransaction.mockResolvedValue({ id: 'posting-id', createdAt: new Date(), idempotencyKey: 'key', correlationId: null });

      await service.runOverdueAccrual();

      const expectedCharge = 12 * HOURLY_OVERAGE_KOBO;
      expect(ledgerService.postTransaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            money: Money.of(expectedCharge, 'NGN'),
          }),
        ]),
        expect.objectContaining({
          idempotencyKey: 'rental-overage:rental-id:12',
        }),
        mockEntityManager,
      );
    });

    it('should cap overage at 60000 kobo (24 hours)', async () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 3600000);
      const rental = {
        id: 'rental-id',
        userId: 'user-id',
        powerbankId: 'pb-id',
        status: RentalStatus.OVERDUE,
        dueAt: twentyFiveHoursAgo,
        totalChargedAmount: BASE_RATE_KOBO.toString(),
      } as Rental;

      rentalsRepo.find.mockResolvedValue([rental]);
      mockEntityManager.findOne.mockResolvedValue(rental);
      mockEntityManager.find.mockResolvedValue([]);
      mockEntityManager.save.mockResolvedValue(rental);
      mockEntityManager.create.mockImplementation((_entity: unknown, data: unknown) => data as RentalCharge);
      ledgerService.getBalanceOrZero.mockResolvedValue({ amount: 100000, currency: 'NGN' });
      ledgerService.postTransaction.mockResolvedValue({ id: 'posting-id', createdAt: new Date(), idempotencyKey: 'key', correlationId: null });

      await service.runOverdueAccrual();

      expect(ledgerService.postTransaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            money: Money.of(MAX_OVERAGE_KOBO, 'NGN'),
          }),
        ]),
        expect.anything(),
        mockEntityManager,
      );
    });

    it('should be idempotent and not post duplicate charge on re-run', async () => {
      const oneHourAgo = new Date(Date.now() - 3600000);
      const rental = {
        id: 'rental-id',
        userId: 'user-id',
        powerbankId: 'pb-id',
        status: RentalStatus.OVERDUE,
        dueAt: oneHourAgo,
        totalChargedAmount: (BASE_RATE_KOBO + HOURLY_OVERAGE_KOBO).toString(),
      } as Rental;

      rentalsRepo.find.mockResolvedValue([rental]);
      mockEntityManager.findOne.mockResolvedValue(rental);
      mockEntityManager.find.mockResolvedValue([
        {
          rentalId: rental.id,
          chargeType: RentalChargeType.OVERAGE,
          amount: HOURLY_OVERAGE_KOBO.toString(),
        } as RentalCharge,
      ]);

      await service.runOverdueAccrual();

      expect(ledgerService.postTransaction).not.toHaveBeenCalled();
    });

    it('should transition to UNRETURNED at 24 overage hours', async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000);
      const rental = {
        id: 'rental-id',
        userId: 'user-id',
        powerbankId: 'pb-id',
        status: RentalStatus.OVERDUE,
        dueAt: twentyFourHoursAgo,
        totalChargedAmount: BASE_RATE_KOBO.toString(),
      } as Rental;

      const powerbank = {
        id: 'pb-id',
        status: PowerbankStatus.OVERDUE,
      } as Powerbank;

      rentalsRepo.find.mockResolvedValue([rental]);
      mockEntityManager.findOne
        .mockResolvedValueOnce(rental)
        .mockResolvedValueOnce(powerbank);
      mockEntityManager.find.mockResolvedValue([]);
      mockEntityManager.save.mockResolvedValue(rental);
      mockEntityManager.create.mockImplementation((_entity: unknown, data: unknown) => data as RentalCharge);
      ledgerService.getBalanceOrZero.mockResolvedValue({ amount: 100000, currency: 'NGN' });
      ledgerService.postTransaction.mockResolvedValue({ id: 'posting-id', createdAt: new Date(), idempotencyKey: 'key', correlationId: null });

      await service.runOverdueAccrual();

      expect(mockEntityManager.save).toHaveBeenCalledWith(
        Rental,
        expect.objectContaining({
          status: RentalStatus.UNRETURNED,
        }),
      );
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        Powerbank,
        expect.objectContaining({
          status: PowerbankStatus.UNRETURNED,
        }),
      );
    });

    it('should create OutstandingBalance when wallet insufficient', async () => {
      const oneHourAgo = new Date(Date.now() - 3600000);
      const rental = {
        id: 'rental-id',
        userId: 'user-id',
        powerbankId: 'pb-id',
        status: RentalStatus.OVERDUE,
        dueAt: oneHourAgo,
        totalChargedAmount: BASE_RATE_KOBO.toString(),
      } as Rental;

      rentalsRepo.find.mockResolvedValue([rental]);
      mockEntityManager.findOne.mockResolvedValue(rental);
      mockEntityManager.find.mockResolvedValue([]);
      mockEntityManager.save.mockResolvedValue(rental);
      mockEntityManager.create.mockImplementation((_entity: unknown, data: unknown) => data as RentalCharge);
      ledgerService.getBalanceOrZero.mockResolvedValue({ amount: 0, currency: 'NGN' });

      await service.runOverdueAccrual();

      expect(mockEntityManager.save).toHaveBeenCalledWith(
        OutstandingBalance,
        expect.objectContaining({
          userId: 'user-id',
          amount: HOURLY_OVERAGE_KOBO.toString(),
          reason: OutstandingBalanceReason.RENTAL_OVERAGE,
        }),
      );
      expect(ledgerService.postTransaction).not.toHaveBeenCalled();
    });

    it('should block checkout when outstanding balance exists', async () => {
      const userId = 'user-id';
      const dto = { powerbankId: 'pb-id', shopId: 'shop-id' };

      verificationsRepo.findOne.mockResolvedValue({
        id: 'v1',
        userId,
        status: VerificationSubmissionStatus.APPROVED,
      } as VerificationSubmission);

      outstandingBalancesRepo.find.mockResolvedValue([
        {
          id: 'ob1',
          userId,
          amount: '2500',
          currency: 'NGN',
          reason: OutstandingBalanceReason.RENTAL_OVERAGE,
          clearedAt: null,
        } as OutstandingBalance,
      ]);

      await expect(service.checkout(userId, dto)).rejects.toThrow(OutstandingBalanceExistsError);
    });
  });

  describe('chargeReplacement', () => {
    it('should create OutstandingBalance if wallet has insufficient funds', async () => {
      const rental = {
        id: 'rental-id',
        userId: 'user-id',
        powerbankId: 'pb-id',
        status: RentalStatus.UNRETURNED,
      } as Rental;

      const powerbank = {
        id: 'pb-id',
        replacementPriceAmount: '50000',
        replacementPriceCurrency: 'NGN',
      } as Powerbank;

      mockEntityManager.findOne
        .mockResolvedValueOnce(rental)
        .mockResolvedValueOnce(powerbank);
      mockEntityManager.save.mockResolvedValue({});
      mockEntityManager.create.mockImplementation((_entity: unknown, data: unknown) => data as RentalCharge);
      ledgerService.getBalanceOrZero.mockResolvedValue({ amount: 10000, currency: 'NGN' });
      auditService.record.mockResolvedValue({} as never);

      await service.chargeReplacement('rental-id', 'admin-id', 'Lost powerbank');

      expect(mockEntityManager.save).toHaveBeenCalledWith(
        OutstandingBalance,
        expect.objectContaining({
          userId: 'user-id',
          amount: '50000',
          currency: 'NGN',
          reason: OutstandingBalanceReason.REPLACEMENT_CHARGE,
        }),
      );
    });
  });

  describe('reverseReplacement', () => {
    it('should clear outstanding balance and post compensating entry', async () => {
      const rental = {
        id: 'rental-id',
        userId: 'user-id',
        powerbankId: 'pb-id',
      } as Rental;

      const replacementCharge = {
        id: 'charge-id',
        rentalId: 'rental-id',
        chargeType: RentalChargeType.REPLACEMENT,
        amount: '50000',
        currency: 'NGN',
      } as RentalCharge;

      const outstandingBalance = {
        id: 'ob-id',
        userId: 'user-id',
        rentalId: 'rental-id',
        reason: OutstandingBalanceReason.REPLACEMENT_CHARGE,
        clearedAt: null,
      } as OutstandingBalance;

      mockEntityManager.findOne
        .mockResolvedValueOnce(rental)
        .mockResolvedValueOnce(replacementCharge)
        .mockResolvedValueOnce(outstandingBalance);
      mockEntityManager.save.mockResolvedValue({});
      ledgerService.postTransaction.mockResolvedValue({ id: 'posting-id', createdAt: new Date(), idempotencyKey: 'key', correlationId: null });
      auditService.record.mockResolvedValue({} as never);

      await service.reverseReplacement('rental-id', 'admin-id', 'Powerbank returned');

      expect(ledgerService.postTransaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            accountRef: 'user:user-id:wallet:NGN',
            money: Money.of(50000, 'NGN'),
          }),
        ]),
        expect.objectContaining({
          idempotencyKey: 'rental-replacement-reversal:rental-id',
        }),
        mockEntityManager,
      );

      expect(mockEntityManager.save).toHaveBeenCalledWith(
        OutstandingBalance,
        expect.objectContaining({
          clearedAt: expect.any(Date),
        }),
      );
    });
  });
});
