import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { InvitePreviewResponse } from '@mezzo/shared-types';
import { EscrowService } from './escrow.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { EscrowDetailResponse, toEscrowDetailResponse } from './dto/escrow-response';

@Controller('invites')
export class InviteController {
  constructor(private readonly escrowService: EscrowService) {}

  @Get(':token')
  @Public()
  async preview(@Param('token') token: string): Promise<InvitePreviewResponse> {
    return this.escrowService.previewInvite(token);
  }

  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<EscrowDetailResponse> {
    const escrow = await this.escrowService.acceptInvite(token, currentUser.id);
    const detail = await this.escrowService.getDetail(escrow.id);
    return toEscrowDetailResponse(detail.escrow, detail.terms, detail.parties);
  }
}
