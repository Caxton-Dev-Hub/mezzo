import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { EscrowService } from './escrow.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { shipEscrowSchema, ShipEscrowDto } from './dto/settlement.schemas';
import { EscrowDetailResponse, toEscrowDetailResponse } from './dto/escrow-response';

@Controller('escrows')
export class SettlementController {
  constructor(
    private readonly settlementService: SettlementService,
    private readonly escrowService: EscrowService,
  ) {}

  @Post(':id/ship')
  @HttpCode(HttpStatus.OK)
  async ship(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(shipEscrowSchema)) dto: ShipEscrowDto,
  ): Promise<EscrowDetailResponse> {
    await this.settlementService.ship(id, currentUser.id, dto);
    return this.getDetail(id);
  }

  @Post(':id/confirm-delivery')
  @HttpCode(HttpStatus.OK)
  async confirmDelivery(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EscrowDetailResponse> {
    await this.settlementService.confirmDelivery(id, currentUser.id);
    return this.getDetail(id);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  async release(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EscrowDetailResponse> {
    await this.settlementService.release(id, currentUser.id);
    return this.getDetail(id);
  }

  private async getDetail(id: string): Promise<EscrowDetailResponse> {
    const detail = await this.escrowService.getDetail(id);
    return toEscrowDetailResponse(detail.escrow, detail.terms, detail.parties);
  }
}
