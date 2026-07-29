import { Controller, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { NotificationResponse } from './dto/notification-response';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() currentUser: AuthenticatedUser): Promise<NotificationResponse[]> {
    return this.notificationsService.listForUser(currentUser.id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() currentUser: AuthenticatedUser): Promise<void> {
    return this.notificationsService.markAllRead(currentUser.id);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<NotificationResponse> {
    return this.notificationsService.markRead(id, currentUser.id);
  }
}
