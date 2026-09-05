import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageSenderType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { DomainEvents } from '../../common/event-bus/events';
import { SendMessageDto } from './dto/send-message.dto';

// Plain chat between a customer and a dealer who answered their request.
// There's no negotiation state, agreed price or order here by design — the
// platform introduces the two sides and stays out of the deal itself.
// Conversations are never created here; they're created by a dealer
// answering a request (modules/requests).
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  // "الرسائل" for a customer — one row per dealer who answered, with the
  // request it came from and the last message, so the list renders without
  // a request per row.
  listForCustomer(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        dealer: { select: { id: true, businessName: true, city: true, contactPhone: true } },
        partRequest: { select: { id: true, partName: true, vehicleMake: true, vehicleModel: true } },
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });
  }

  // The same list from the dealer's side.
  listForDealer(dealerId: string) {
    return this.prisma.conversation.findMany({
      where: { dealerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, name: true, phone: true } },
        partRequest: { select: { id: true, partName: true, vehicleMake: true, vehicleModel: true } },
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });
  }

  // Both sides of the thread must be checked on every read and write:
  // conversation ids are opaque, but "unguessable" is not authorization.
  private async assertParticipant(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { dealer: { select: { ownerUserId: true } } },
    });
    if (!conversation) throw new NotFoundException('المحادثة غير موجودة.');

    const isCustomer = conversation.userId === userId;
    const isDealer = conversation.dealer.ownerUserId === userId;
    if (!isCustomer && !isDealer) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لهذه المحادثة.');
    }
    return { conversation, senderType: isDealer ? MessageSenderType.DEALER : MessageSenderType.USER };
  }

  async sendMessage(conversationId: string, userId: string, dto: SendMessageDto) {
    const { conversation, senderType } = await this.assertParticipant(conversationId, userId);

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderType,
        senderUserId: userId,
        text: dto.text,
        imageUrl: dto.imageUrl,
      },
    });

    this.eventBus.publish(DomainEvents.MESSAGE_SENT, {
      conversationId,
      senderType,
      customerUserId: conversation.userId,
      dealerId: conversation.dealerId,
    });

    return message;
  }

  // Newest 200, then flipped back into reading order. Taking from the end
  // is what keeps a long-running thread from getting slower every time
  // it's opened — the app only ever renders the recent tail anyway.
  async listMessages(conversationId: string, userId: string) {
    await this.assertParticipant(conversationId, userId);
    const recent = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return recent.reverse();
  }
}
