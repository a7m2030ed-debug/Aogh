import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { DomainEvents } from '../../common/event-bus/events';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async create(authorUserId: string, dto: CreateReviewDto) {
    const review = await this.prisma.review.create({
      data: {
        orderId: dto.orderId,
        authorUserId,
        targetDealerId: dto.targetDealerId,
        targetUserId: dto.targetUserId,
        stars: dto.stars,
        comment: dto.comment,
      },
    });

    if (dto.targetDealerId) {
      await this.recalculateDealerRating(dto.targetDealerId);
    }

    this.eventBus.publish(DomainEvents.REVIEW_SUBMITTED, { reviewId: review.id });
    return review;
  }

  private async recalculateDealerRating(dealerId: string) {
    const agg = await this.prisma.review.aggregate({
      where: { targetDealerId: dealerId },
      _avg: { stars: true },
      _count: true,
    });
    await this.prisma.dealer.update({
      where: { id: dealerId },
      data: {
        ratingAverage: agg._avg.stars ?? 0,
        ratingCount: agg._count,
      },
    });
  }
}
