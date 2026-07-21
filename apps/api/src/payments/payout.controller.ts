import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requestPayoutSchema, RequestPayoutDto } from './dto/payout.schemas';
import { PayoutResponse } from './dto/payout-response';

@Controller('payouts')
export class PayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  requestPayout(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(requestPayoutSchema)) dto: RequestPayoutDto,
  ): Promise<PayoutResponse> {
    return this.payoutService.requestPayout(currentUser.id, dto);
  }
}
