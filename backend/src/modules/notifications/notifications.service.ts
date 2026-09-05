import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { DomainEvents } from '../../common/event-bus/events';
import { PUSH_PROVIDER, PushProvider } from './push/push-provider.interface';

// Arabic copy for each notification type this module fires.
const PUSH_COPY: Record<string, { title: string; body: string }> = {
  part_request_created: { title: 'طلب جديد', body: 'عميل يبحث عن قطعة — اضغط للتفاصيل.' },
  request_answered: { title: 'رد على طلبك', body: 'تاجر يقول إن القطعة متوفرة عنده.' },
  message_received: { title: 'رسالة جديدة', body: 'وصلتك رسالة جديدة.' },
};

// Demonstrates the Modular Monolith pattern the review specifies (section
// 7.1): this module knows nothing about how a request got created or
// answered — it just reacts to events published on the shared bus.
@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: PushProvider,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe(DomainEvents.PART_REQUEST_CREATED, (payload: any) => {
      void this.broadcastToDealers(payload);
    });
    this.eventBus.subscribe(DomainEvents.REQUEST_ANSWERED, (payload: any) => {
      void this.notifyCustomer(payload.customerUserId, 'request_answered', payload);
    });
    this.eventBus.subscribe(DomainEvents.MESSAGE_SENT, (payload: any) => {
      void this.notifyOtherSide(payload);
    });
  }

  async registerPushToken(userId: string, token: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { pushToken: token } });
  }

  // The core of the product: every verified dealer hears about every open
  // request. Client decision for the pilot (2026-09-05) — with a handful
  // of dealers this is exactly right, and per-dealer targeting (by make or
  // city) is the obvious first refinement once the roster grows enough for
  // untargeted blasts to become noise.
  private async broadcastToDealers(payload: {
    partRequestId: string;
    partName: string;
    vehicleMake: string;
    vehicleModel: string;
  }) {
    const dealers = await this.prisma.dealer.findMany({
      where: { verificationStatus: 'VERIFIED' },
      select: { id: true, owner: { select: { pushToken: true } } },
    });
    if (dealers.length === 0) return;

    await this.prisma.notification.createMany({
      data: dealers.map((dealer) => ({
        dealerId: dealer.id,
        type: 'part_request_created',
        payload: payload as any,
      })),
    });

    const body = `${payload.partName} — ${payload.vehicleMake} ${payload.vehicleModel}`;
    await Promise.all(
      dealers
        .filter((dealer) => dealer.owner.pushToken)
        .map((dealer) =>
          this.pushProvider.send(dealer.owner.pushToken!, PUSH_COPY.part_request_created.title, body, {
            type: 'part_request_created',
            partRequestId: payload.partRequestId,
          }),
        ),
    );
  }

  private async notifyCustomer(userId: string, type: string, payload: unknown) {
    await this.prisma.notification.create({
      data: { userId, type, payload: payload as any },
    });
    await this.pushToUser(userId, type);
  }

  // A message notifies whoever didn't send it.
  private async notifyOtherSide(payload: {
    conversationId: string;
    senderType: 'USER' | 'DEALER';
    customerUserId: string;
    dealerId: string;
  }) {
    if (payload.senderType === 'USER') {
      await this.prisma.notification.create({
        data: { dealerId: payload.dealerId, type: 'message_received', payload: payload as any },
      });
      await this.pushToDealer(payload.dealerId, 'message_received');
    } else {
      await this.notifyCustomer(payload.customerUserId, 'message_received', payload);
    }
  }

  // Best-effort — a missing token or a dead FCM registration must never
  // fail the domain event it's reacting to. PushProvider implementations
  // already swallow their own errors; the token-presence check here just
  // skips the call entirely when there's nothing to send to.
  private async pushToUser(userId: string, type: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.pushToken) return;
    const copy = PUSH_COPY[type] ?? { title: 'إشعار', body: '' };
    await this.pushProvider.send(user.pushToken, copy.title, copy.body, { type });
  }

  private async pushToDealer(dealerId: string, type: string) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { id: dealerId },
      include: { owner: true },
    });
    if (!dealer?.owner.pushToken) return;
    const copy = PUSH_COPY[type] ?? { title: 'إشعار', body: '' };
    await this.pushProvider.send(dealer.owner.pushToken, copy.title, copy.body, { type });
  }

  // A dealer's notifications are addressed to their dealer id, not their
  // user id, so filtering on userId alone left every dealer with an empty
  // bell while their pushes arrived normally.
  async listForUser(userId: string) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { ownerUserId: userId },
      select: { id: true },
    });

    return this.prisma.notification.findMany({
      where: dealer ? { OR: [{ userId }, { dealerId: dealer.id }] } : { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // Scoped to the caller: without the ownership filter this was an id away
  // from letting anyone mark anyone else's notifications read. updateMany
  // (rather than update) means a miss is a no-op instead of an error that
  // would confirm the id exists.
  async markRead(id: string, userId: string) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { ownerUserId: userId },
      select: { id: true },
    });

    await this.prisma.notification.updateMany({
      where: {
        id,
        ...(dealer ? { OR: [{ userId }, { dealerId: dealer.id }] } : { userId }),
      },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
