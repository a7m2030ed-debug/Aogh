import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './common/prisma/prisma.module';
import { EventBusModule } from './common/event-bus/event-bus.module';
import { IdentityModule } from './modules/identity/identity.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TrustModule } from './modules/trust/trust.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    EventBusModule,
    IdentityModule,
    CatalogModule,
    InventoryModule,
    ConversationsModule,
    OrdersModule,
    TrustModule,
    NotificationsModule,
    AdminModule,
    AiModule,
  ],
})
export class AppModule {}
