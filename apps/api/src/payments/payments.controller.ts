import type { Request } from 'express';
import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post, RawBodyRequest, Req } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { paystackWebhookSchema, PaystackWebhookDto } from './dto/payments.schemas';
import { PaymentIntentResponse } from './dto/payments-response';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('escrows/:escrowId/fund')
  @HttpCode(HttpStatus.CREATED)
  fund(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('escrowId') escrowId: string,
  ): Promise<PaymentIntentResponse> {
    return this.paymentsService.initiateFunding(currentUser.id, escrowId);
  }

  @Public()
  @Post('webhook/paystack')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string | undefined,
    @Body(new ZodValidationPipe(paystackWebhookSchema)) dto: PaystackWebhookDto,
  ): Promise<{ received: true }> {
    await this.paymentsService.handleWebhook(request.rawBody ?? Buffer.alloc(0), signature, dto);
    return { received: true };
  }
}
