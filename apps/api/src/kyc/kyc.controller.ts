import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { KycService } from './kyc.service';
import { SettingsService } from '../settings/settings.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { KycTier } from './entities/kyc-tier.enum';
import { KycDocumentType } from './entities/kyc-document-type.enum';
import {
  presignKycDocumentSchema,
  PresignKycDocumentDto,
  confirmKycDocumentSchema,
  ConfirmKycDocumentDto,
  submitManualKycSchema,
  SubmitManualKycDto,
} from './dto/kyc.schemas';
import {
  KycStatusResponse,
  KycVerificationResponse,
  PresignKycDocumentResponse,
  toKycVerificationResponse,
  toKycDocumentResponse,
} from './dto/kyc-response';
import { KycDocumentResponse } from '@mezzo/shared-types';

@Controller('kyc')
export class KycController {
  constructor(
    private readonly kycService: KycService,
    private readonly settingsService: SettingsService,
  ) {}

  @Post('documents/presign')
  @HttpCode(HttpStatus.CREATED)
  async presignDocument(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(presignKycDocumentSchema)) dto: PresignKycDocumentDto,
  ): Promise<PresignKycDocumentResponse> {
    return this.kycService.presignDocument(
      currentUser.id,
      KycDocumentType[dto.documentType],
      dto.mimeType,
    );
  }

  @Post('documents/confirm')
  @HttpCode(HttpStatus.CREATED)
  async confirmDocument(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(confirmKycDocumentSchema)) dto: ConfirmKycDocumentDto,
  ): Promise<KycDocumentResponse> {
    const document = await this.kycService.confirmDocument(
      currentUser.id,
      dto.key,
      KycDocumentType[dto.documentType],
      dto.declaredMime,
    );
    return toKycDocumentResponse(document);
  }

  @Post('manual-submissions')
  @HttpCode(HttpStatus.CREATED)
  async submitManual(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(submitManualKycSchema)) dto: SubmitManualKycDto,
  ): Promise<KycVerificationResponse> {
    const verification = await this.kycService.submitManual(
      currentUser.id,
      KycTier[dto.tier],
      dto.documentIds,
    );
    return toKycVerificationResponse(verification);
  }

  @Get('me')
  async me(@CurrentUser() currentUser: AuthenticatedUser): Promise<KycStatusResponse> {
    const [tier, latestVerification, verificationEnabled] = await Promise.all([
      this.kycService.getTier(currentUser.id),
      this.kycService.getLatestVerification(currentUser.id),
      this.settingsService.isVerificationEnabled(),
    ]);

    return {
      tier,
      latestVerification: latestVerification ? toKycVerificationResponse(latestVerification) : null,
      verificationEnabled,
    };
  }
}
