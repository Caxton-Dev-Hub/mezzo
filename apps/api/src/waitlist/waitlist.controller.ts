import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { joinWaitlistSchema, JoinWaitlistDto } from '@mezzo/shared-types';
import { WaitlistService } from './waitlist.service';
import { WaitlistSignupResponse } from './dto/waitlist-response';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthRateLimitGuard } from '../auth/guards/auth-rate-limit.guard';

@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  join(
    @Body(new ZodValidationPipe(joinWaitlistSchema)) dto: JoinWaitlistDto,
  ): Promise<WaitlistSignupResponse> {
    return this.waitlistService.join(dto.email);
  }
}
