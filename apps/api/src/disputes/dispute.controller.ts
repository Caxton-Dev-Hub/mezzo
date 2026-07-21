import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { DisputeService } from './dispute.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import {
  RaiseDisputeDto,
  raiseDisputeSchema,
  ResolveDisputeDto,
  resolveDisputeSchema,
} from './dto/dispute.schemas';
import { DisputePacketResponse, DisputeResponse, toDisputeResponse } from './dto/dispute-response';

@Controller()
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @Post('escrows/:escrowId/disputes')
  @HttpCode(HttpStatus.CREATED)
  async raise(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('escrowId') escrowId: string,
    @Body(new ZodValidationPipe(raiseDisputeSchema)) dto: RaiseDisputeDto,
  ): Promise<DisputeResponse> {
    const dispute = await this.disputeService.raise(escrowId, currentUser.id, dto);
    return toDisputeResponse(dispute);
  }

  @Get('disputes/:id')
  async getPacket(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DisputePacketResponse> {
    return this.disputeService.getPacket(id, currentUser);
  }

  @Post('disputes/:id/close-evidence-window')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ARBITER, UserRole.ADMIN)
  async closeEvidenceWindow(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DisputeResponse> {
    const dispute = await this.disputeService.closeEvidenceWindow(id, currentUser.id);
    return toDisputeResponse(dispute);
  }

  @Post('disputes/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ARBITER, UserRole.ADMIN)
  async resolve(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveDisputeSchema)) dto: ResolveDisputeDto,
  ): Promise<DisputeResponse> {
    const dispute = await this.disputeService.resolve(id, currentUser.id, dto);
    return toDisputeResponse(dispute);
  }
}
