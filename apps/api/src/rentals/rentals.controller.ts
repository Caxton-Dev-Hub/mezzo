import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import { RentalsService } from './rentals.service';
import {
  CheckoutDto,
  checkoutSchema,
  MarkUnreturnedDto,
  markUnreturnedSchema,
  ChargeReplacementDto,
  chargeReplacementSchema,
  ReverseReplacementDto,
  reverseReplacementSchema,
} from './dto/rentals.schemas';
import {
  CheckoutResponse,
  RentalListResponse,
  RentalDetailResponse,
  toRentalDetailResponse,
} from './dto/rentals-response';

interface RequestWithShopScope extends Request {
  allowedShopIds?: string[] | null;
}

@Controller('rentals')
export class RentalsController {
  constructor(private readonly rentalsService: RentalsService) {}

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  async checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(checkoutSchema)) dto: CheckoutDto,
  ): Promise<CheckoutResponse> {
    const rental = await this.rentalsService.checkout(user.id, dto);
    return { rental: toRentalDetailResponse(rental) };
  }

  @Post(':id/checkin')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @HttpCode(HttpStatus.OK)
  async checkin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') rentalId: string,
  ): Promise<RentalDetailResponse> {
    const rental = await this.rentalsService.checkin(rentalId, user.id);
    return toRentalDetailResponse(rental);
  }

  @Get()
  async listRentals(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestWithShopScope,
  ): Promise<RentalListResponse> {
    const allowedShopIds = request.allowedShopIds ?? null;
    const rentals = await this.rentalsService.listRentals(user.id, user.role, allowedShopIds);
    return { rentals: rentals.map(toRentalDetailResponse) };
  }

  @Get(':id')
  async getRental(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RentalDetailResponse> {
    const rental = await this.rentalsService.getRental(id, user.id, user.role);
    return toRentalDetailResponse(rental);
  }

  @Post(':id/mark-unreturned')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @HttpCode(HttpStatus.OK)
  async markUnreturned(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') rentalId: string,
    @Body(new ZodValidationPipe(markUnreturnedSchema)) dto: MarkUnreturnedDto,
  ): Promise<RentalDetailResponse> {
    const rental = await this.rentalsService.markUnreturned(rentalId, user.id, dto.reason);
    return toRentalDetailResponse(rental);
  }

  @Post(':id/charge-replacement')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async chargeReplacement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') rentalId: string,
    @Body(new ZodValidationPipe(chargeReplacementSchema)) dto: ChargeReplacementDto,
  ): Promise<void> {
    await this.rentalsService.chargeReplacement(rentalId, user.id, dto.reason);
  }

  @Post(':id/reverse-replacement')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reverseReplacement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') rentalId: string,
    @Body(new ZodValidationPipe(reverseReplacementSchema)) dto: ReverseReplacementDto,
  ): Promise<void> {
    await this.rentalsService.reverseReplacement(rentalId, user.id, dto.reason);
  }
}
