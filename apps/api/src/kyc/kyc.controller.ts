import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { KycService } from './kyc.service';
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
  constructor(private readonly kycService: KycService) {}

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
    @Body(new ZodValidationPipe(kycWebhookSchema)) dto: KycWebhookDto,
  ): Promise<KycVerificationResponse> {
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
