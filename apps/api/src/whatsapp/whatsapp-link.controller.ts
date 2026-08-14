import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { startWhatsAppLinkSchema, StartWhatsAppLinkDto } from './dto/whatsapp.schemas';
import { WhatsAppLinkingService } from './whatsapp-linking.service';

@Controller('whatsapp/link')
export class WhatsAppLinkController {
  constructor(private readonly linkingService: WhatsAppLinkingService) {}

  @Post('start')
  @HttpCode(HttpStatus.ACCEPTED)
  async start(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(startWhatsAppLinkSchema)) dto: StartWhatsAppLinkDto,
  ): Promise<{ status: 'code_sent' }> {
    await this.linkingService.startLink(currentUser.id, dto.phoneNumber);
    return { status: 'code_sent' };
  }
}
