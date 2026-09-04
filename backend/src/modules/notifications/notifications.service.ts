import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { DomainEvents } from '../../common/event-bus/events';

// Demonstrates the Modular Monolith pattern the review specifies (section
// 7.1): this module knows nothing about how a listing got sold or an offer
// got submitted — it just reacts to events published on the shared bus.
// Actual push delivery (FCM, per section 7.6) is not wired up; today this
// only writes the in-app Notification row.
@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe(DomainEvents.SEARCH_REQUEST_CREATED, () => {
      // TODO: fan out to dealers matching the request's city/vehicle once
      // that targeting exists (search-requests.service.ts findOpenForDealer).
    });
    this.eventBus.subscribe(DomainEvents.NEGOTIATION_AGREED, (payload: any) => {
      this.notifyByConversation(payload.conversationId, 'negotiation_agreed', payload);
    });
    this.eventBus.subscribe(DomainEvents.ORDER_STATUS_CHANGED, (payload: any) => {
      this.notifyOrderParties(payload.orderId, 'order_status_changed', payload);
    });
  }

  private async notifyByConversation(conversationId: string, type: string, payload: unknown) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return;
    await this.prisma.notification.create({
      data: { userId: conversation.userId, type, payload: payload as any },
    });
    await this.prisma.notification.create({
      data: { dealerId: conversation.dealerId, type, payload: payload as any },
    });
  }

  private async notifyOrderParties(orderId: string, type: string, payload: unknown) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;
    await this.prisma.notification.create({
      data: { userId: order.customerId, type, payload: payload as any },
    });
    await this.prisma.notification.create({
      data: { dealerId: order.dealerId, type, payload: payload as any },
    });
  }

  listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  markRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
}
