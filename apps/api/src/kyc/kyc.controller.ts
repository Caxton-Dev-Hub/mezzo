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
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { KycTier } from './entities/kyc-tier.enum';
import { kycWebhookSchema, KycWebhookDto, submitKycSchema, SubmitKycDto } from './dto/kyc.schemas';
import {
  KycStatusResponse,
  KycVerificationResponse,
  toKycVerificationResponse,
} from './dto/kyc-response';

@Controller('kyc')
export class KycController {
  constructor(
    private readonly kycService: KycService,
    private readonly webhookSignature: KycWebhookSignatureService,
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
    const [tier, latestVerification] = await Promise.all([
      this.kycService.getTier(currentUser.id),
      this.kycService.getLatestVerification(currentUser.id),
    ]);

    return {
      tier,
      latestVerification: latestVerification ? toKycVerificationResponse(latestVerification) : null,
    };
  }
}
