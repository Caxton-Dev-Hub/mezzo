import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { ShopsService } from './shops.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import { STORAGE_PROVIDER, StorageProvider } from '../evidence/storage/storage-provider.interface';
import { VerificationSubmissionStatus } from '../database/entities/verification-submission.entity';
import {
  createShopSchema,
  CreateShopDto,
  assignStaffSchema,
  AssignStaffDto,
  submitVerificationSchema,
  SubmitVerificationDto,
  reviewVerificationSchema,
  ReviewVerificationDto,
} from './dto/shops.schemas';
import {
  ShopResponse,
  toShopResponse,
  StaffAssignmentResponse,
  toStaffAssignmentResponse,
  VerificationSubmissionResponse,
  toVerificationSubmissionResponse,
} from './dto/shops-response';

@Controller('shops')
export class ShopsController {
  constructor(
    private readonly shopsService: ShopsService,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createShop(
    @Body(new ZodValidationPipe(createShopSchema)) dto: CreateShopDto,
  ): Promise<ShopResponse> {
    const shop = await this.shopsService.createShop(dto);
    return toShopResponse(shop);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async listShops(): Promise<ShopResponse[]> {
    const shops = await this.shopsService.listShops();
    return shops.map(toShopResponse);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async getShop(@Param('id') id: string): Promise<ShopResponse> {
    const shop = await this.shopsService.getShop(id);
    return toShopResponse(shop);
  }

  @Post(':id/staff')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async assignStaff(
    @Param('id') shopId: string,
    @Body(new ZodValidationPipe(assignStaffSchema)) dto: AssignStaffDto,
  ): Promise<StaffAssignmentResponse> {
    const assignment = await this.shopsService.assignStaff(shopId, dto.userId);
    return toStaffAssignmentResponse(assignment);
  }

  @Delete(':shopId/staff/:userId')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStaff(@Param('shopId') shopId: string, @Param('userId') userId: string): Promise<void> {
    await this.shopsService.removeStaff(shopId, userId);
  }

  @Post('verifications')
  @HttpCode(HttpStatus.CREATED)
  async submitVerification(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(submitVerificationSchema)) dto: SubmitVerificationDto,
  ): Promise<VerificationSubmissionResponse> {
    const submission = await this.shopsService.submitVerification(currentUser.id, dto);
    return toVerificationSubmissionResponse(submission);
  }

  @Get('verifications')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async listVerificationSubmissions(
    @Query('status') status?: string,
  ): Promise<VerificationSubmissionResponse[]> {
    const validStatus = status
      ? (status.toUpperCase() as VerificationSubmissionStatus)
      : undefined;
    const submissions = await this.shopsService.listVerificationSubmissions(validStatus);
    return submissions.map(toVerificationSubmissionResponse);
  }

  @Get('verifications/:id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async getVerification(@Param('id') id: string): Promise<VerificationSubmissionResponse> {
    const verification = await this.shopsService.getVerification(id);
    return toVerificationSubmissionResponse(verification);
  }

  @Post('verifications/:id/approve')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async approveVerification(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewVerificationSchema)) dto: ReviewVerificationDto,
  ): Promise<VerificationSubmissionResponse> {
    const verification = await this.shopsService.approveVerification(currentUser.id, id, dto);
    return toVerificationSubmissionResponse(verification);
  }

  @Post('verifications/:id/reject')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async rejectVerification(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewVerificationSchema)) dto: ReviewVerificationDto,
  ): Promise<VerificationSubmissionResponse> {
    const verification = await this.shopsService.rejectVerification(currentUser.id, id, dto);
    return toVerificationSubmissionResponse(verification);
  }

  @Get('verifications/:id/photo')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @Redirect()
  async getVerificationPhoto(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ url: string }> {
    const photoStorageKey = await this.shopsService.getVerificationPhotoKey(
      id,
      currentUser.id,
      currentUser.role,
    );
    const url = await this.storage.getPresignedDownloadUrl(photoStorageKey);
    return { url };
  }
}
