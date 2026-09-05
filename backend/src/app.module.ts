import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './common/prisma/prisma.module';
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
})
export class AppModule {}
