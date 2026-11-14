/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { STORAGE_PROVIDER, StorageProvider } from '../evidence/storage/storage-provider.interface';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import { Shop } from '../database/entities/shop.entity';
import {
  VerificationSubmission,
  VerificationSubmissionStatus,
} from '../database/entities/verification-submission.entity';

describe('ShopsController', () => {
  let controller: ShopsController;
  let shopsService: jest.Mocked<ShopsService>;
  let storageProvider: jest.Mocked<StorageProvider>;

  const mockAdmin: AuthenticatedUser = {
    id: 'admin-id',
    role: UserRole.ADMIN,
  };

  const mockStaff: AuthenticatedUser = {
    id: 'staff-id',
    role: UserRole.STAFF,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShopsController],
      providers: [
        {
          provide: ShopsService,
          useValue: {
            createShop: jest.fn(),
            listShops: jest.fn(),
            getShop: jest.fn(),
            assignStaff: jest.fn(),
            removeStaff: jest.fn(),
            submitVerification: jest.fn(),
            listVerificationSubmissions: jest.fn(),
            getVerification: jest.fn(),
            approveVerification: jest.fn(),
            rejectVerification: jest.fn(),
            getVerificationPhotoKey: jest.fn(),
          },
        },
        {
          provide: STORAGE_PROVIDER,
          useValue: {
            getPresignedUploadUrl: jest.fn(),
            getPresignedDownloadUrl: jest.fn(),
            getObject: jest.fn(),
            deleteObject: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ShopsController>(ShopsController);
    shopsService = module.get(ShopsService);
    storageProvider = module.get(STORAGE_PROVIDER);
  });

  describe('createShop', () => {
    it('should require ADMIN role', async () => {
      const dto = { name: 'Test Shop', location: 'Test Location' };
      const shop = {
        id: 'shop-id',
        ...dto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      shopsService.createShop.mockResolvedValue(shop);

      const result = await controller.createShop(dto);

      expect(result.id).toBe('shop-id');
      expect(result.name).toBe(dto.name);
      expect(shopsService.createShop).toHaveBeenCalledWith(dto);
    });
  });

  describe('listShops', () => {
    it('should list all shops', async () => {
      const shops = [
        {
          id: 'shop-1',
          name: 'Shop 1',
          location: 'Location 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as Shop[];

      shopsService.listShops.mockResolvedValue(shops);

      const result = await controller.listShops();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('shop-1');
    });
  });

  describe('submitVerification', () => {
    it('should create verification submission with status PENDING', async () => {
      const dto = {
        fullName: 'John Doe',
        phoneNumber: '1234567890',
        photoStorageKey: 'photo-key',
      };

      const submission = {
        id: 'v1',
        userId: mockAdmin.id,
        ...dto,
        status: VerificationSubmissionStatus.PENDING,
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
      } as VerificationSubmission;

      shopsService.submitVerification.mockResolvedValue(submission);

      const result = await controller.submitVerification(mockAdmin, dto);

      expect(result.status).toBe(VerificationSubmissionStatus.PENDING);
      expect(result.fullName).toBe(dto.fullName);
      expect(shopsService.submitVerification).toHaveBeenCalledWith(mockAdmin.id, dto);
    });
  });

  describe('approveVerification', () => {
    it('should transition status to APPROVED and record audit event', async () => {
      const verificationId = 'v1';
      const dto = { notes: 'Approved' };

      const submission = {
        id: verificationId,
        userId: 'user-id',
        fullName: 'John Doe',
        phoneNumber: '123',
        photoStorageKey: 'key',
        status: VerificationSubmissionStatus.APPROVED,
        submittedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: mockAdmin.id,
        reviewNotes: dto.notes,
      } as VerificationSubmission;

      shopsService.approveVerification.mockResolvedValue(submission);

      const result = await controller.approveVerification(mockAdmin, verificationId, dto);

      expect(result.status).toBe(VerificationSubmissionStatus.APPROVED);
      expect(result.reviewedBy).toBe(mockAdmin.id);
      expect(shopsService.approveVerification).toHaveBeenCalledWith(
        mockAdmin.id,
        verificationId,
        dto,
      );
    });
  });

  describe('getVerificationPhoto', () => {
    it('should return presigned URL for ADMIN', async () => {
      const verificationId = 'v1';
      const photoStorageKey = 'photo-key';
      const presignedUrl = 'https://s3.amazonaws.com/presigned-url';

      shopsService.getVerificationPhotoKey.mockResolvedValue(photoStorageKey);
      storageProvider.getPresignedDownloadUrl.mockResolvedValue(presignedUrl);

      const result = await controller.getVerificationPhoto(mockAdmin, verificationId);

      expect(result.url).toBe(presignedUrl);
      expect(shopsService.getVerificationPhotoKey).toHaveBeenCalledWith(
        verificationId,
        mockAdmin.id,
        mockAdmin.role,
      );
      expect(storageProvider.getPresignedDownloadUrl).toHaveBeenCalledWith(photoStorageKey);
    });

    it('should return presigned URL for STAFF', async () => {
      const verificationId = 'v1';
      const photoStorageKey = 'photo-key';
      const presignedUrl = 'https://s3.amazonaws.com/presigned-url';

      shopsService.getVerificationPhotoKey.mockResolvedValue(photoStorageKey);
      storageProvider.getPresignedDownloadUrl.mockResolvedValue(presignedUrl);

      const result = await controller.getVerificationPhoto(mockStaff, verificationId);

      expect(result.url).toBe(presignedUrl);
      expect(shopsService.getVerificationPhotoKey).toHaveBeenCalledWith(
        verificationId,
        mockStaff.id,
        mockStaff.role,
      );
    });
  });
});
