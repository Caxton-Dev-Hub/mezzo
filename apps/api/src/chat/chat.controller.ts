import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { SendMessageDto, sendMessageSchema } from './dto/chat.schemas';
import { ChatMessageResponse } from './dto/chat-response';

@Controller('escrows/:escrowId/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('escrowId') escrowId: string,
  ): Promise<ChatMessageResponse[]> {
    return this.chatService.list(escrowId, currentUser);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  send(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('escrowId') escrowId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ): Promise<ChatMessageResponse> {
    return this.chatService.send(escrowId, currentUser, dto);
  }
}
