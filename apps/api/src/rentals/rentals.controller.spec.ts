/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { RentalsController } from './rentals.controller';
import { RentalsService } from './rentals.service';
import { UserRole } from '../users/entities/user-role.enum';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Rental, RentalStatus } from '../database/entities/rental.entity';

describe('RentalsController', () => {
  let controller: RentalsController;
  let service: jest.Mocked<RentalsService>;

  const mockUser: AuthenticatedUser = {
    id: 'user-id',
    role: UserRole.USER,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RentalsController],
      providers: [
        {
          provide: RentalsService,
          useValue: {
            checkout: jest.fn(),
            checkin: jest.fn(),
            listRentals: jest.fn(),
            getRental: jest.fn(),
            markUnreturned: jest.fn(),
            chargeReplacement: jest.fn(),
            reverseReplacement: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<RentalsController>(RentalsController);
    service = module.get(RentalsService);
  });

  describe('POST /rentals/checkout', () => {
    it('should call service.checkout with user id and dto', async () => {
      const dto = { powerbankId: 'pb-id', shopId: 'shop-id' };
      const rental = {
        id: 'rental-id',
        userId: mockUser.id,
        status: RentalStatus.ACTIVE,
        startedAt: new Date(),
        dueAt: new Date(),
        baseChargeAmount: '60000',
        baseChargeCurrency: 'NGN',
        totalChargedAmount: '60000',
        totalChargedCurrency: 'NGN',
      } as Rental;

      service.checkout.mockResolvedValue(rental);

      await controller.checkout(mockUser, dto);

      expect(service.checkout).toHaveBeenCalledWith(mockUser.id, dto);
    });
  });

  describe('POST /rentals/:id/checkin', () => {
    it('should call service.checkin with rental id and actor id', async () => {
      const rentalId = 'rental-id';
      const rental = {
        id: rentalId,
        status: RentalStatus.RETURNED,
        startedAt: new Date(),
        dueAt: new Date(),
        baseChargeAmount: '60000',
        baseChargeCurrency: 'NGN',
        totalChargedAmount: '60000',
        totalChargedCurrency: 'NGN',
      } as Rental;

      service.checkin.mockResolvedValue(rental);

      await controller.checkin(mockUser, rentalId);

      expect(service.checkin).toHaveBeenCalledWith(rentalId, mockUser.id);
    });
  });

  describe('POST /rentals/:id/charge-replacement', () => {
    it('should call service.chargeReplacement', async () => {
      const dto = { rentalId: 'rental-id', reason: 'Lost powerbank' };

      service.chargeReplacement.mockResolvedValue(undefined);

      await controller.chargeReplacement(mockUser, 'rental-id', dto);

      expect(service.chargeReplacement).toHaveBeenCalledWith(
        'rental-id',
        mockUser.id,
        dto.reason,
      );
    });
  });

  describe('POST /rentals/:id/reverse-replacement', () => {
    it('should call service.reverseReplacement', async () => {
      const dto = { rentalId: 'rental-id', reason: 'Powerbank returned' };

      service.reverseReplacement.mockResolvedValue(undefined);

      await controller.reverseReplacement(mockUser, 'rental-id', dto);

      expect(service.reverseReplacement).toHaveBeenCalledWith(
        'rental-id',
        mockUser.id,
        dto.reason,
      );
    });
  });
});
