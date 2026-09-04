import { Body, Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.notificationsService.listForUser(user.userId);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.notificationsService.markRead(id);
  }

  // Called once on app start (and whenever FCM rotates the token) with
  // the value from the mobile app's firebase_messaging getToken() call —
  // see mobile/README.md for the client-side half of this.
  @Patch('push-token')
  registerPushToken(
    @CurrentUser() user: { userId: string },
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.notificationsService.registerPushToken(user.userId, dto.token);
  }
}
