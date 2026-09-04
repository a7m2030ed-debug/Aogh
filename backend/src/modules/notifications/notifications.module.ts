import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PUSH_PROVIDER, PushProvider } from './push/push-provider.interface';
import { NoopPushProvider } from './push/providers/noop-push.provider';
import { FcmPushProvider } from './push/providers/fcm-push.provider';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NoopPushProvider,
    FcmPushProvider,
    {
      provide: PUSH_PROVIDER,
      // PUSH_PROVIDER=fcm + FCM_* in .env activates real delivery — see
      // backend/README.md. Defaults to a no-op so a fresh checkout with
      // no Firebase project still boots; the in-app Notification row is
      // written either way, only the device wake-up is skipped.
      useFactory: (
        config: ConfigService,
        noop: NoopPushProvider,
        fcm: FcmPushProvider,
      ): PushProvider => (config.get<string>('push.provider') === 'fcm' ? fcm : noop),
      inject: [ConfigService, NoopPushProvider, FcmPushProvider],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
