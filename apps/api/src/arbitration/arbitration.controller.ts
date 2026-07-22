import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ArbitrationService } from './arbitration.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import { ArbitrationRecordResponse, toArbitrationRecordResponse } from './dto/arbitration-response';

@Controller('disputes/:disputeId/arbitration-recommendations')
@Roles(UserRole.ARBITER, UserRole.ADMIN)
export class ArbitrationController {
  constructor(private readonly arbitrationService: ArbitrationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async recommend(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('disputeId') disputeId: string,
  ): Promise<ArbitrationRecordResponse> {
    const record = await this.arbitrationService.recommend(disputeId, currentUser);
    return toArbitrationRecordResponse(record);
  }

  @Get()
  async list(@Param('disputeId') disputeId: string): Promise<ArbitrationRecordResponse[]> {
    const records = await this.arbitrationService.listForDispute(disputeId);
    return records.map(toArbitrationRecordResponse);
  }
}
