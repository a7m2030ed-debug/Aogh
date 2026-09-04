import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { DomainEvents } from '../../common/event-bus/events';
import { CreateSearchRequestDto } from './dto/create-search-request.dto';
import { SubmitSearchRequestOfferDto } from './dto/submit-search-request-offer.dto';

// "ابحث لي عنها" (spec section 31) — the review promotes this from a
// fallback to a primary growth loop for the low-liquidity early weeks
// (section 5, item 11): every unmatched search is a lead dealers can fill,
// not a dead end.
@Injectable()
export class SearchRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async create(userId: string, dto: CreateSearchRequestDto) {
    const request = await this.prisma.searchRequest.create({
      data: { userId, freeText: dto.freeText, canonicalPartId: dto.canonicalPartId },
    });
    this.eventBus.publish(DomainEvents.SEARCH_REQUEST_CREATED, { searchRequestId: request.id });
    return request;
  }

  async submitOffer(searchRequestId: string, dealerId: string, dto: SubmitSearchRequestOfferDto) {
    const offer = await this.prisma.searchRequestOffer.create({
      data: {
        searchRequestId,
        dealerId,
        available: dto.available,
        price: dto.price,
      },
    });
    this.eventBus.publish(DomainEvents.SEARCH_REQUEST_OFFER_SUBMITTED, {
      searchRequestId,
      offerId: offer.id,
    });
    return offer;
  }

  findOpenForDealer() {
    // MVP: dealers browse all open requests. City/vehicle-model matching
    // to narrow this down is a v2 refinement once there's real request
    // volume to tune against.
    return this.prisma.searchRequest.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });
  }
}
