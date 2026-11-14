import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { AccessoriesService } from './accessories.service';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import { UseStaffScopeGuard, StaffScopeRequest } from './decorators/use-staff-scope.decorator';
import {
  createAccessorySchema,
  CreateAccessoryDto,
  updateAccessorySchema,
  UpdateAccessoryDto,
  recordSaleSchema,
  RecordSaleDto,
} from './dto/accessories.schemas';
import {
  AccessoryDetailResponse,
  AccessoryListResponse,
  SaleDetailResponse,
  SaleListResponse,
  toAccessoryDetailResponse,
  toSaleDetailResponse,
} from './dto/accessories-response';

@Controller('accessories')
export class AccessoriesController {
  constructor(private readonly accessoriesService: AccessoriesService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createAccessory(
    @Body(new ZodValidationPipe(createAccessorySchema)) dto: CreateAccessoryDto,
  ): Promise<AccessoryDetailResponse> {
    const accessory = await this.accessoriesService.createAccessory(dto);
    return toAccessoryDetailResponse(accessory);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  async updateAccessory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAccessorySchema)) dto: UpdateAccessoryDto,
  ): Promise<AccessoryDetailResponse> {
    const accessory = await this.accessoriesService.updateAccessory(id, dto);
    return toAccessoryDetailResponse(accessory);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async listAccessories(@Query('shopId') shopId?: string): Promise<AccessoryListResponse> {
    const accessories = await this.accessoriesService.listAccessories(shopId);
    return { items: accessories.map(toAccessoryDetailResponse) };
  }

  @Post('sales')
  @Roles(UserRole.STAFF)
  @UseStaffScopeGuard()
  @HttpCode(HttpStatus.CREATED)
  async recordSale(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(recordSaleSchema)) dto: RecordSaleDto,
  ): Promise<SaleDetailResponse> {
    const sale = await this.accessoriesService.recordSale(currentUser.id, dto);
    return toSaleDetailResponse(sale);
  }

  @Get('sales')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @UseStaffScopeGuard()
  async listSales(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() req: StaffScopeRequest,
  ): Promise<SaleListResponse> {
    const sales = await this.accessoriesService.listSales(
      currentUser.id,
      currentUser.role,
      req.allowedShopIds,
    );
    return { items: sales.map(toSaleDetailResponse) };
  }
}
