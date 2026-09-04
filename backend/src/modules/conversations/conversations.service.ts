import { Injectable, NotFoundException } from '@nestjs/common';
import { MessageSenderType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { DomainEvents } from '../../common/event-bus/events';
import { StartConversationDto } from './dto/start-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ProposePriceDto } from './dto/propose-price.dto';

// Covers spec sections 21-23 (negotiation + agreement) at skeleton depth:
// enough structure for the mobile app's chat screen to be built against,
// full negotiation UX (counter-offer expiry, structured accept/reject
// buttons) is explicitly deferred to v2 by the review (section 6).
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  startConversation(userId: string, dto: StartConversationDto) {
    return this.prisma.conversation.create({
      data: { userId, dealerId: dto.dealerId, listingId: dto.listingId },
    });
  }

  sendMessage(conversationId: string, senderType: MessageSenderType, senderUserId: string | undefined, dto: SendMessageDto) {
    return this.prisma.message.create({
      data: {
        conversationId,
        senderType,
        senderUserId,
        text: dto.text,
        imageUrl: dto.imageUrl,
      },
    });
  }

  listMessages(conversationId: string) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async proposePrice(conversationId: string, proposedBy: MessageSenderType, dto: ProposePriceDto) {
    const negotiation = await this.prisma.negotiation.upsert({
      where: { conversationId },
      update: {},
      create: { conversationId },
    });

    return this.prisma.negotiationOffer.create({
      data: { negotiationId: negotiation.id, proposedBy, price: dto.price },
    });
  }

  async acceptLatestOffer(conversationId: string) {
    const negotiation = await this.prisma.negotiation.findUnique({
      where: { conversationId },
      include: { offers: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!negotiation || negotiation.offers.length === 0) {
      throw new NotFoundException('No offer to accept for this conversation');
    }

    const updated = await this.prisma.negotiation.update({
      where: { id: negotiation.id },
      data: { agreedPrice: negotiation.offers[0].price, agreedAt: new Date() },
    });

    this.eventBus.publish(DomainEvents.NEGOTIATION_AGREED, {
      conversationId,
      agreedPrice: updated.agreedPrice,
    });
    return updated;
  }
}
