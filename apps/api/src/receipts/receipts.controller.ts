import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ReceiptResponse } from '@mezzo/shared-types';
import { ReceiptsService } from './receipts.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { renderReceiptPdf } from './receipt-pdf';

@Controller('escrows')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get(':id/receipt')
  async getReceipt(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReceiptResponse> {
    return this.receiptsService.getReceipt(id, currentUser.id);
  }

  @Get(':id/receipt.pdf')
  async getReceiptPdf(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const receipt = await this.receiptsService.getReceipt(id, currentUser.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="mezzo-receipt-${id}.pdf"`);
    renderReceiptPdf(receipt).pipe(res);
  }
}
