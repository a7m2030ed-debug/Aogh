import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageSenderType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { DomainEvents } from '../../common/event-bus/events';
import { CreatePartRequestDto } from './dto/create-part-request.dto';
import { AnswerRequestDto } from './dto/answer-request.dto';

// The entire product loop: a customer posts a request, every dealer is
// notified, and a dealer who has the part answers — which opens a
// conversation and ends this module's involvement. Nothing here tracks
// price, stock, fulfilment or outcome; that's between the two of them.
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async create(userId: string, dto: CreatePartRequestDto) {
    const request = await this.prisma.partRequest.create({
      data: {
        userId,
        partName: dto.partName,
        vehicleMake: dto.vehicleMake,
        vehicleModel: dto.vehicleModel,
        photoUrl: dto.photoUrl,
      },
    });

    // The fan-out to dealers happens in modules/notifications, which
    // subscribes to this — see the Modular Monolith rule in the schema
    // header: this module doesn't know who listens.
    this.eventBus.publish(DomainEvents.PART_REQUEST_CREATED, {
      partRequestId: request.id,
      partName: request.partName,
      vehicleMake: request.vehicleMake,
      vehicleModel: request.vehicleModel,
    });

    return request;
  }

  // "طلباتي" — with the dealers who have answered so far, so the customer
  // can go straight into a thread.
  listMine(userId: string) {
    return this.prisma.partRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        conversations: {
          select: {
            id: true,
            createdAt: true,
            dealer: { select: { id: true, businessName: true, city: true, contactPhone: true } },
          },
        },
      },
    });
  }

  async findMine(userId: string, id: string) {
    const request = await this.prisma.partRequest.findUnique({
      where: { id },
      include: {
        conversations: {
          select: {
            id: true,
            createdAt: true,
            dealer: { select: { id: true, businessName: true, city: true, contactPhone: true } },
          },
        },
      },
    });
    if (!request) throw new NotFoundException('الطلب غير موجود.');
    if (request.userId !== userId) throw new ForbiddenException('هذا الطلب ليس لك.');
    return request;
  }

  async close(userId: string, id: string) {
    await this.findMine(userId, id);
    return this.prisma.partRequest.update({
      where: { id },
      data: { status: 'CLOSED' },
    });
  }

  // The dealer feed. Answered requests stay in the list — another dealer
  // may still have the part, and the customer picks between them — but a
  // dealer's own answer is flagged so the app can show "تم الرد" instead
  // of offering the button twice.
  async listOpenForDealer(dealerId: string) {
    const requests = await this.prisma.partRequest.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { conversations: { where: { dealerId }, select: { id: true } } },
    });

    return requests.map(({ conversations, ...request }) => ({
      ...request,
      myConversationId: conversations[0]?.id ?? null,
    }));
  }

  // Idempotent by design: the schema's unique (partRequestId, dealerId)
  // means a second tap returns the dealer to the thread they already have
  // rather than creating a duplicate.
  async answer(dealerId: string, requestId: string, dto: AnswerRequestDto) {
    const request = await this.prisma.partRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('الطلب غير موجود.');
    if (request.status === 'CLOSED') {
      throw new ForbiddenException('هذا الطلب مغلق.');
    }

    const existing = await this.prisma.conversation.findUnique({
      where: { partRequestId_dealerId: { partRequestId: requestId, dealerId } },
    });

    const conversation =
      existing ??
      (await this.prisma.conversation.create({
        data: { partRequestId: requestId, dealerId, userId: request.userId },
      }));

    if (dto.message) {
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: MessageSenderType.DEALER,
          text: dto.message,
        },
      });
    }

    // Only announce a genuinely new answer — re-entering an existing
    // thread shouldn't re-notify the customer.
    if (!existing) {
      this.eventBus.publish(DomainEvents.REQUEST_ANSWERED, {
        partRequestId: requestId,
        conversationId: conversation.id,
        customerUserId: request.userId,
        dealerId,
      });
    }

    return conversation;
  }
}
