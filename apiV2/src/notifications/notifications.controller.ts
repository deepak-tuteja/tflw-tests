import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(AnyAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthedUser) {
    return this.notifications.findAllForUser(user.id);
  }
}
