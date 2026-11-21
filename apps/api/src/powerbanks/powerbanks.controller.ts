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
} from '@nestjs/common';
import { PowerbanksService } from './powerbanks.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import {
  createPowerbankSchema,
  CreatePowerbankDto,
} from './dto/powerbanks.schemas';
import {
  PowerbankDetailResponse,
  PowerbankListResponse,
  toPowerbankDetailResponse,
} from './dto/powerbanks-response';

@Controller('powerbanks')
export class PowerbanksController {
  constructor(private readonly powerbanksService: PowerbanksService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createPowerbank(
    @Body(new ZodValidationPipe(createPowerbankSchema)) dto: CreatePowerbankDto,
  ): Promise<PowerbankDetailResponse> {
    const powerbank = await this.powerbanksService.createPowerbank(dto);
    return toPowerbankDetailResponse(powerbank);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async listPowerbanks(@Query('shopId') shopId?: string): Promise<PowerbankListResponse> {
    const powerbanks = await this.powerbanksService.listPowerbanks(shopId);
    return { items: powerbanks.map(toPowerbankDetailResponse) };
  }

  @Get('available')
  @Public()
  async listAvailablePowerbanks(@Query('shopId') shopId?: string): Promise<PowerbankListResponse> {
    const powerbanks = await this.powerbanksService.listAvailablePowerbanks(shopId);
    return { items: powerbanks.map(toPowerbankDetailResponse) };
  }

  @Patch(':id/mark-available')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async markAvailable(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<PowerbankDetailResponse> {
    const powerbank = await this.powerbanksService.markAvailable(id, currentUser.id);
    return toPowerbankDetailResponse(powerbank);
  }

  @Patch(':id/mark-maintenance')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async markMaintenance(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<PowerbankDetailResponse> {
    const powerbank = await this.powerbanksService.markMaintenance(id, currentUser.id);
    return toPowerbankDetailResponse(powerbank);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async getPowerbank(@Param('id') id: string): Promise<PowerbankDetailResponse> {
    const powerbank = await this.powerbanksService.getPowerbank(id);
    return toPowerbankDetailResponse(powerbank);
  }

  @Patch(':id/mark-lost')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async markLost(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<PowerbankDetailResponse> {
    const powerbank = await this.powerbanksService.markLost(id, currentUser.id);
    return toPowerbankDetailResponse(powerbank);
  }

  @Patch(':id/mark-unreturned')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async markUnreturned(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<PowerbankDetailResponse> {
    const powerbank = await this.powerbanksService.markUnreturned(id, currentUser.id);
    return toPowerbankDetailResponse(powerbank);
  }
}
