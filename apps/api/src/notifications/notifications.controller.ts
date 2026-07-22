import { Controller, Get } from '@nestjs/common';
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
}
