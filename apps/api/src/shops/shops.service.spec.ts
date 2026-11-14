/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ShopsService } from './shops.service';
import { Shop } from '../database/entities/shop.entity';
import { StaffAssignment } from '../database/entities/staff-assignment.entity';
import {
  VerificationSubmission,
  VerificationSubmissionStatus,
} from '../database/entities/verification-submission.entity';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../users/entities/user-role.enum';
import {
  VerificationNotPendingError,
  VerificationAlreadyExistsError,
} from './shops.errors';

describe('ShopsService', () => {
  let service: ShopsService;
  let shopsRepo: jest.Mocked<Repository<Shop>>;
  let staffAssignmentsRepo: jest.Mocked<Repository<StaffAssignment>>;
  let verificationsRepo: jest.Mocked<Repository<VerificationSubmission>>;
  let auditService: jest.Mocked<AuditService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopsService,
        {
          provide: getRepositoryToken(Shop),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(StaffAssignment),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(VerificationSubmission),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
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

    service = module.get<ShopsService>(ShopsService);
    shopsRepo = module.get(getRepositoryToken(Shop));
    staffAssignmentsRepo = module.get(getRepositoryToken(StaffAssignment));
    verificationsRepo = module.get(getRepositoryToken(VerificationSubmission));
    auditService = module.get(AuditService);
  });

  describe('createShop', () => {
    it('should create a shop entity', async () => {
      const dto = { name: 'Test Shop', location: 'Test Location' };
      const shop = { id: 'shop-id', ...dto, createdAt: new Date(), updatedAt: new Date() };

      shopsRepo.create.mockReturnValue(shop);
      shopsRepo.save.mockResolvedValue(shop);

      const result = await service.createShop(dto);

      expect(result).toEqual(shop);
      expect(shopsRepo.create).toHaveBeenCalledWith(dto);
      expect(shopsRepo.save).toHaveBeenCalledWith(shop);
    });
  });

  describe('getStaffShopIds', () => {
    it('should return correct shops for staff user', async () => {
      const userId = 'user-id';
      const assignments = [
        { id: 'a1', userId, shopId: 'shop-1', createdAt: new Date() },
        { id: 'a2', userId, shopId: 'shop-2', createdAt: new Date() },
      ] as StaffAssignment[];

      staffAssignmentsRepo.find.mockResolvedValue(assignments);

      const result = await service.getStaffShopIds(userId);

      expect(result).toEqual(['shop-1', 'shop-2']);
      expect(staffAssignmentsRepo.find).toHaveBeenCalledWith({
        where: { userId },
        select: ['shopId'],
      });
    });

    it('should return empty array if no assignments', async () => {
      staffAssignmentsRepo.find.mockResolvedValue([]);

      const result = await service.getStaffShopIds('user-id');

      expect(result).toEqual([]);
    });
  });

  describe('submitVerification', () => {
    it('should enforce one PENDING per user', async () => {
      const userId = 'user-id';
      const dto = {
        fullName: 'John Doe',
        phoneNumber: '1234567890',
        photoStorageKey: 'key',
      };

      verificationsRepo.findOne.mockResolvedValue({
        id: 'v1',
        userId,
        status: VerificationSubmissionStatus.PENDING,
      } as VerificationSubmission);

      await expect(service.submitVerification(userId, dto)).rejects.toThrow(
        VerificationAlreadyExistsError,
      );
    });

    it('should enforce one APPROVED per user', async () => {
      const userId = 'user-id';
      const dto = {
        fullName: 'John Doe',
        phoneNumber: '1234567890',
        photoStorageKey: 'key',
      };

      verificationsRepo.findOne.mockResolvedValue({
        id: 'v1',
        userId,
        status: VerificationSubmissionStatus.APPROVED,
      } as VerificationSubmission);

      await expect(service.submitVerification(userId, dto)).rejects.toThrow(
        VerificationAlreadyExistsError,
      );
    });

    it('should create verification if no PENDING or APPROVED exists', async () => {
      const userId = 'user-id';
      const dto = {
        fullName: 'John Doe',
        phoneNumber: '1234567890',
        photoStorageKey: 'key',
      };

      verificationsRepo.findOne.mockResolvedValue(null);
      verificationsRepo.create.mockReturnValue({
        ...dto,
        userId,
        status: VerificationSubmissionStatus.PENDING,
      } as VerificationSubmission);
      verificationsRepo.save.mockResolvedValue({
        id: 'v1',
        ...dto,
        userId,
        status: VerificationSubmissionStatus.PENDING,
        submittedAt: new Date(),
      } as VerificationSubmission);

      const result = await service.submitVerification(userId, dto);

      expect(result.status).toBe(VerificationSubmissionStatus.PENDING);
      expect(verificationsRepo.save).toHaveBeenCalled();
    });
  });

  describe('approveVerification', () => {
    it('should transition status to APPROVED and record audit event', async () => {
      const actorId = 'admin-id';
      const verificationId = 'v1';
      const verification = {
        id: verificationId,
        userId: 'user-id',
        status: VerificationSubmissionStatus.PENDING,
        fullName: 'John Doe',
        phoneNumber: '123',
        photoStorageKey: 'key',
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
      } as VerificationSubmission;

      verificationsRepo.findOne.mockResolvedValue(verification);
      verificationsRepo.save.mockImplementation((entity) => Promise.resolve(entity as VerificationSubmission));
      auditService.record.mockResolvedValue({} as never);

      const result = await service.approveVerification(actorId, verificationId, {
        notes: 'Approved',
      });

      expect(result.status).toBe(VerificationSubmissionStatus.APPROVED);
      expect(result.reviewedBy).toBe(actorId);
      expect(result.reviewNotes).toBe('Approved');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId,
          action: 'verification.approved',
          entityType: 'VerificationSubmission',
          entityId: verificationId,
        }),
      );
    });

    it('should throw if verification is not PENDING', async () => {
      const verification = {
        id: 'v1',
        status: VerificationSubmissionStatus.APPROVED,
      } as VerificationSubmission;

      verificationsRepo.findOne.mockResolvedValue(verification);

      await expect(service.approveVerification('admin', 'v1')).rejects.toThrow(
        VerificationNotPendingError,
      );
    });
  });

  describe('getVerificationPhotoKey', () => {
    it('should return photoStorageKey for ADMIN', async () => {
      const verification = {
        id: 'v1',
        photoStorageKey: 'photo-key',
      } as VerificationSubmission;

      verificationsRepo.findOne.mockResolvedValue(verification);

      const result = await service.getVerificationPhotoKey('v1', 'admin-id', UserRole.ADMIN);

      expect(result).toBe('photo-key');
    });

    it('should return photoStorageKey for STAFF assigned to any shop', async () => {
      const verification = {
        id: 'v1',
        photoStorageKey: 'photo-key',
      } as VerificationSubmission;

      verificationsRepo.findOne.mockResolvedValue(verification);
      staffAssignmentsRepo.find.mockResolvedValue([
        { shopId: 'shop-1' } as StaffAssignment,
      ]);

      const result = await service.getVerificationPhotoKey('v1', 'staff-id', UserRole.STAFF);

      expect(result).toBe('photo-key');
    });

    it('should deny access for non-ADMIN non-STAFF', async () => {
      const verification = {
        id: 'v1',
        photoStorageKey: 'photo-key',
      } as VerificationSubmission;

      verificationsRepo.findOne.mockResolvedValue(verification);

      await expect(
        service.getVerificationPhotoKey('v1', 'user-id', UserRole.USER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should deny access for STAFF not assigned to any shop', async () => {
      const verification = {
        id: 'v1',
        photoStorageKey: 'photo-key',
      } as VerificationSubmission;

      verificationsRepo.findOne.mockResolvedValue(verification);
      staffAssignmentsRepo.find.mockResolvedValue([]);

      await expect(
        service.getVerificationPhotoKey('v1', 'staff-id', UserRole.STAFF),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
