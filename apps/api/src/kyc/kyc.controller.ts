import type { Request } from 'express';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { KycService } from './kyc.service';
import { KycWebhookSignatureService } from './webhook-signature.service';
import { SettingsService } from '../settings/settings.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { KycTier } from './entities/kyc-tier.enum';
import { KycDocumentType } from './entities/kyc-document-type.enum';
import {
  kycWebhookSchema,
  KycWebhookDto,
  submitKycSchema,
  SubmitKycDto,
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
    private readonly webhookSignature: KycWebhookSignatureService,
    private readonly settingsService: SettingsService,
  ) {}

  @Post('submissions')
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(submitKycSchema)) dto: SubmitKycDto,
  ): Promise<KycVerificationResponse> {
    const verification = await this.kycService.submit(currentUser.id, KycTier[dto.tier]);
    return toKycVerificationResponse(verification);
  }

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

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-dojah-signature') signature: string | undefined,
    @Body(new ZodValidationPipe(kycWebhookSchema)) dto: KycWebhookDto,
  ): Promise<KycVerificationResponse> {
    this.webhookSignature.verify(request.rawBody ?? Buffer.alloc(0), signature);
    const verification = await this.kycService.handleProviderCallback(dto);
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
