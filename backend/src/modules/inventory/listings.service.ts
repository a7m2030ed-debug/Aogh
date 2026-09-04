import { Injectable, NotFoundException } from '@nestjs/common';
import { ListingAvailability } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { DomainEvents } from '../../common/event-bus/events';
import { haversineKm } from '../../common/geo/haversine';
import { CreateListingDto } from './dto/create-listing.dto';

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async create(dealerId: string, dto: CreateListingDto) {
    const listing = await this.prisma.inventoryListing.create({
      data: {
        dealerId,
        canonicalPartId: dto.canonicalPartId,
        vehicleModelId: dto.vehicleModelId,
        vehicleYear: dto.vehicleYear,
        price: dto.price,
        quantity: dto.quantity ?? 1,
        condition: dto.condition,
        color: dto.color,
        notes: dto.notes,
        aiSuggested: dto.aiSuggested ?? false,
        aiConfidence: dto.aiConfidence,
        images: dto.imageUrls?.length
          ? { create: dto.imageUrls.map((url, sortOrder) => ({ url, sortOrder })) }
          : undefined,
      },
      include: { images: true },
    });

    this.eventBus.publish(DomainEvents.LISTING_CREATED, { listingId: listing.id });
    return listing;
  }

  // lat/lng are optional so the part-details page can show the same
  // distance badge search results already do (spec section 20) without
  // requiring location — same pattern as SearchService.search.
  async findById(id: string, lat?: number, lng?: number) {
    const listing = await this.prisma.inventoryListing.findUnique({
      where: { id },
      include: { images: true, videos: true, dealer: true, canonicalPart: true, vehicleModel: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const distanceKm =
      lat != null && lng != null && listing.dealer.lat != null && listing.dealer.lng != null
        ? haversineKm(lat, lng, listing.dealer.lat, listing.dealer.lng)
        : null;

    return { ...listing, distanceKm };
  }

  async updateAvailability(id: string, availability: ListingAvailability) {
    const listing = await this.prisma.inventoryListing.update({
      where: { id },
      data: { availability },
    });

    this.eventBus.publish(DomainEvents.LISTING_AVAILABILITY_CHANGED, {
      listingId: listing.id,
      availability,
    });
    return listing;
  }

  async markSold(id: string) {
    const listing = await this.updateAvailability(id, ListingAvailability.UNAVAILABLE);
    this.eventBus.publish(DomainEvents.LISTING_SOLD, { listingId: listing.id });
    return listing;
  }
}
