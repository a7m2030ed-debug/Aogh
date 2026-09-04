import { Injectable, NotFoundException } from '@nestjs/common';
import { FulfillmentMethod, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { DomainEvents } from '../../common/event-bus/events';
import { DeliveryFeeCalculator } from './delivery-fee.calculator';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly deliveryFeeCalculator: DeliveryFeeCalculator,
  ) {}

  async create(customerId: string, dto: CreateOrderDto) {
    const listing = await this.prisma.inventoryListing.findUnique({
      where: { id: dto.listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const deliveryFee =
      dto.fulfillment === FulfillmentMethod.DELIVERY
        ? this.deliveryFeeCalculator.calculate(dto.distanceKm ?? null)
        : null;
    const totalPrice = dto.agreedPrice + (deliveryFee ?? 0);

    const order = await this.prisma.order.create({
      data: {
        conversationId: dto.conversationId,
        customerId,
        dealerId: listing.dealerId,
        listingId: dto.listingId,
        agreedPrice: dto.agreedPrice,
        fulfillment: dto.fulfillment,
        deliveryFee: deliveryFee ?? undefined,
        totalPrice,
        statusHistory: { create: { status: OrderStatus.CREATED } },
      },
      include: { statusHistory: true },
    });

    return order;
  }

  async updateStatus(orderId: string, status: OrderStatus, note?: string) {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        statusHistory: { create: { status, note } },
      },
    });

    this.eventBus.publish(DomainEvents.ORDER_STATUS_CHANGED, {
      orderId: order.id,
      status,
    });
    return order;
  }

  findById(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: { statusHistory: true, delivery: true },
    });
  }
}
