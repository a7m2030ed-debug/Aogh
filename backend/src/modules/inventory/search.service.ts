import { Injectable } from '@nestjs/common';
import { ListingAvailability } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { haversineKm } from '../../common/geo/haversine';
import { SearchListingsDto, SearchSort } from './dto/search-listings.dto';

// Product goal from spec section 53 is to *measure* the market, not just
// serve results — every search is logged to SearchQuery so "أكثر القطع
// بحثًا" / "أكثر السيارات بحثًا" in the admin reports (section 35) has
// real data from day one instead of being bolted on later.
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(dto: SearchListingsDto, userId?: string) {
    const where: Record<string, unknown> = {
      availability: { not: ListingAvailability.UNAVAILABLE },
    };

    if (dto.q) {
      where.OR = [
        { canonicalPart: { canonicalNameAr: { contains: dto.q, mode: 'insensitive' } } },
        { canonicalPart: { canonicalNameEn: { contains: dto.q, mode: 'insensitive' } } },
        { canonicalPart: { synonyms: { has: dto.q } } },
      ];
    }
    if (dto.maxPrice != null) where.price = { lte: dto.maxPrice };
    if (dto.condition) where.condition = dto.condition;
    if (dto.city) where.dealer = { city: dto.city };

    const listings = await this.prisma.inventoryListing.findMany({
      where,
      include: { dealer: true, canonicalPart: true, images: true, vehicleModel: true },
      take: 50,
    });

    let results = listings.map((listing) => {
      const distanceKm =
        dto.lat != null && dto.lng != null && listing.dealer.lat != null && listing.dealer.lng != null
          ? haversineKm(dto.lat, dto.lng, listing.dealer.lat, listing.dealer.lng)
          : null;
      return { ...listing, distanceKm };
    });

    if (dto.maxDistanceKm != null) {
      results = results.filter((r) => r.distanceKm == null || r.distanceKm <= dto.maxDistanceKm!);
    }

    results = this.sortResults(results, dto.sort);

    await this.prisma.searchQuery.create({
      data: {
        userId,
        type: 'TEXT',
        rawQuery: dto.q,
        resultCount: results.length,
      },
    });

    return results;
  }

  private sortResults<T extends { price: unknown; distanceKm: number | null; dealer: { ratingAverage: number }; createdAt: Date }>(
    results: T[],
    sort?: SearchSort,
  ) {
    switch (sort) {
      case SearchSort.CHEAPEST:
        return [...results].sort((a, b) => Number(a.price) - Number(b.price));
      case SearchSort.NEAREST:
        return [...results].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
      case SearchSort.RATING:
        return [...results].sort((a, b) => b.dealer.ratingAverage - a.dealer.ratingAverage);
      case SearchSort.NEWEST:
        return [...results].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      default:
        return results;
    }
  }
}
