import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthController } from './common/health/health.controller';
import { EventBusModule } from './common/event-bus/event-bus.module';
import { IdentityModule } from './modules/identity/identity.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { RequestsModule } from './modules/requests/requests.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { MediaModule } from './modules/media/media.module';
import { LegalModule } from './modules/legal/legal.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // A floor under every endpoint. Individual routes that cost real money
    // or fan out to everyone (OTP send, request creation) tighten this
    // further with their own @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    EventBusModule,
    IdentityModule,
    CatalogModule,
    RequestsModule,
    ConversationsModule,
    NotificationsModule,
    AdminModule,
    MediaModule,
    LegalModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
