import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Shop } from '../database/entities/shop.entity';
import { StaffAssignment } from '../database/entities/staff-assignment.entity';
import {
  VerificationSubmission,
  VerificationSubmissionStatus,
} from '../database/entities/verification-submission.entity';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../users/entities/user-role.enum';
import {
  ShopNotFoundError,
  VerificationNotFoundError,
  VerificationNotPendingError,
  VerificationAlreadyExistsError,
} from './shops.errors';
import {
  CreateShopDto,
  SubmitVerificationDto,
  ReviewVerificationDto,
} from './dto/shops.schemas';

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop)
    private readonly shops: Repository<Shop>,
    @InjectRepository(StaffAssignment)
    private readonly staffAssignments: Repository<StaffAssignment>,
    @InjectRepository(VerificationSubmission)
    private readonly verificationSubmissions: Repository<VerificationSubmission>,
    private readonly auditService: AuditService,
  ) {}

  async createShop(dto: CreateShopDto): Promise<Shop> {
    const shop = this.shops.create({
      name: dto.name,
      location: dto.location,
    });
    return this.shops.save(shop);
  }

  async listShops(): Promise<Shop[]> {
    return this.shops.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getShop(id: string): Promise<Shop> {
    const shop = await this.shops.findOne({ where: { id } });
    if (!shop) {
      throw new ShopNotFoundError(id);
    }
    return shop;
  }

  async assignStaff(shopId: string, userId: string): Promise<StaffAssignment> {
    const shop = await this.getShop(shopId);

    const existing = await this.staffAssignments.findOne({
      where: { shopId: shop.id, userId },
    });

    if (existing) {
      return existing;
    }

    const assignment = this.staffAssignments.create({
      shopId: shop.id,
      userId,
    });

    return this.staffAssignments.save(assignment);
  }

  async removeStaff(shopId: string, userId: string): Promise<void> {
    const shop = await this.getShop(shopId);

    await this.staffAssignments.delete({
      shopId: shop.id,
      userId,
    });
  }

  async getStaffShopIds(userId: string): Promise<string[]> {
    const assignments = await this.staffAssignments.find({
      where: { userId },
      select: ['shopId'],
    });

    return assignments.map((a) => a.shopId);
  }

  async submitVerification(
    userId: string,
    dto: SubmitVerificationDto,
  ): Promise<VerificationSubmission> {
    const existing = await this.verificationSubmissions.findOne({
      where: {
        userId,
        status: In([VerificationSubmissionStatus.PENDING, VerificationSubmissionStatus.APPROVED]),
      },
    });

    if (existing) {
      throw new VerificationAlreadyExistsError();
    }

    const submission = this.verificationSubmissions.create({
      userId,
      fullName: dto.fullName,
      phoneNumber: dto.phoneNumber,
      photoStorageKey: dto.photoStorageKey,
      status: VerificationSubmissionStatus.PENDING,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: null,
    });

    return this.verificationSubmissions.save(submission);
  }

  async listVerificationSubmissions(
    status?: VerificationSubmissionStatus,
  ): Promise<VerificationSubmission[]> {
    return this.verificationSubmissions.find({
      where: status ? { status } : {},
      order: { submittedAt: 'DESC' },
    });
  }

  async getVerification(id: string): Promise<VerificationSubmission> {
    const verification = await this.verificationSubmissions.findOne({ where: { id } });
    if (!verification) {
      throw new VerificationNotFoundError(id);
    }
    return verification;
  }

  async getVerificationPhotoKey(
    id: string,
    requestingUserId: string,
    requestingRole: UserRole,
  ): Promise<string> {
    const verification = await this.getVerification(id);

    if (requestingRole === UserRole.ADMIN) {
      return verification.photoStorageKey;
    }

    if (requestingRole === UserRole.STAFF) {
      const shopIds = await this.getStaffShopIds(requestingUserId);
      if (shopIds.length > 0) {
        return verification.photoStorageKey;
      }
    }

    throw new ForbiddenException('Access to verification photo denied');
  }

  async approveVerification(
    actorId: string,
    id: string,
    dto?: ReviewVerificationDto,
  ): Promise<VerificationSubmission> {
    const verification = await this.getVerification(id);

    if (verification.status !== VerificationSubmissionStatus.PENDING) {
      throw new VerificationNotPendingError();
    }

    verification.status = VerificationSubmissionStatus.APPROVED;
    verification.reviewedAt = new Date();
    verification.reviewedBy = actorId;
    verification.reviewNotes = dto?.notes ?? null;

    const saved = await this.verificationSubmissions.save(verification);

    await this.auditService.record({
      actorId,
      action: 'verification.approved',
      entityType: 'VerificationSubmission',
      entityId: verification.id,
      reason: dto?.notes,
      before: { status: VerificationSubmissionStatus.PENDING },
      after: { status: VerificationSubmissionStatus.APPROVED },
    });

    return saved;
  }

  async rejectVerification(
    actorId: string,
    id: string,
    dto?: ReviewVerificationDto,
  ): Promise<VerificationSubmission> {
    const verification = await this.getVerification(id);

    if (verification.status !== VerificationSubmissionStatus.PENDING) {
      throw new VerificationNotPendingError();
    }

    verification.status = VerificationSubmissionStatus.REJECTED;
    verification.reviewedAt = new Date();
    verification.reviewedBy = actorId;
    verification.reviewNotes = dto?.notes ?? null;

    const saved = await this.verificationSubmissions.save(verification);

    await this.auditService.record({
      actorId,
      action: 'verification.rejected',
      entityType: 'VerificationSubmission',
      entityId: verification.id,
      reason: dto?.notes,
      before: { status: VerificationSubmissionStatus.PENDING },
      after: { status: VerificationSubmissionStatus.REJECTED },
    });

    return saved;
  }
}
