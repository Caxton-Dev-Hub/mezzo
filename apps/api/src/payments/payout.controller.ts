import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { Bank } from '@mezzo/shared-types';
import { PayoutService } from './payout.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  payoutAccountInputSchema,
  PayoutAccountInput,
  requestPayoutSchema,
  RequestPayoutDto,
} from './dto/payout.schemas';
import { PayoutResponse } from './dto/payout-response';
import { PayoutAccountResponse } from './dto/payout-account-response';

@Controller('payouts')
export class PayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  @Get('banks')
  listBanks(): Promise<Bank[]> {
    return this.payoutService.listBanks();
  }

  @Post('verify-account')
  @HttpCode(HttpStatus.OK)
  verifyAccount(
    @Body(new ZodValidationPipe(payoutAccountInputSchema)) dto: PayoutAccountInput,
  ): Promise<{ accountName: string }> {
    return this.payoutService.verifyAccount(dto);
  }

  @Get('account')
  getPayoutAccount(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<PayoutAccountResponse | null> {
    return this.payoutService.getPayoutAccount(currentUser.id);
  }

  @Put('account')
  savePayoutAccount(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(payoutAccountInputSchema)) dto: PayoutAccountInput,
  ): Promise<PayoutAccountResponse> {
    return this.payoutService.savePayoutAccount(currentUser.id, dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  requestPayout(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(requestPayoutSchema)) dto: RequestPayoutDto,
  ): Promise<PayoutResponse> {
    return this.payoutService.requestPayout(currentUser.id, dto);
  }

  @Get()
  list(@CurrentUser() currentUser: AuthenticatedUser): Promise<PayoutResponse[]> {
    return this.payoutService.listPayouts(currentUser.id);
  }
}
