import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { DomainEvents } from '../../common/event-bus/events';
import { PUSH_PROVIDER, PushProvider } from './push/push-provider.interface';

// Arabic copy for the notification types this module currently fires
// (spec section 32 lists the full set customer/dealer-side; more get
// added here as more domain events grow a subscriber).
const PUSH_COPY: Record<string, { title: string; body: string }> = {
  negotiation_agreed: { title: 'تم الاتفاق', body: 'تم الاتفاق على السعر النهائي.' },
  order_status_changed: { title: 'تحديث الطلب', body: 'تغيّرت حالة طلبك.' },
};

// Demonstrates the Modular Monolith pattern the review specifies (section
// 7.1): this module knows nothing about how a listing got sold or an offer
// got submitted — it just reacts to events published on the shared bus.
@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: PushProvider,
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

  async registerPushToken(userId: string, token: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { pushToken: token } });
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
    await this.pushToUser(conversation.userId, type);
    await this.pushToDealer(conversation.dealerId, type);
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
    await this.pushToUser(order.customerId, type);
    await this.pushToDealer(order.dealerId, type);
  }

  // Best-effort — a missing token or a dead FCM registration must never
  // fail the domain event it's reacting to. PushProvider implementations
  // (NoopPushProvider, FcmPushProvider) already swallow their own errors;
  // the token-presence check here just skips the call entirely when there's
  // nothing to send to.
  private async pushToUser(userId: string, type: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.pushToken) return;
    const copy = PUSH_COPY[type] ?? { title: 'إشعار', body: '' };
    await this.pushProvider.send(user.pushToken, copy.title, copy.body, { type });
  }

  private async pushToDealer(dealerId: string, type: string) {
    const dealer = await this.prisma.dealer.findUnique({ where: { id: dealerId }, include: { owner: true } });
    if (!dealer?.owner.pushToken) return;
    const copy = PUSH_COPY[type] ?? { title: 'إشعار', body: '' };
    await this.pushProvider.send(dealer.owner.pushToken, copy.title, copy.body, { type });
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
