import { Injectable, NotFoundException } from '@nestjs/common';
import { DealerVerificationStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { haversineKm } from '../../common/geo/haversine';
import { RegisterDealerDto } from './dto/register-dealer.dto';
import { ListDealersDto, DealerSort } from './dto/list-dealers.dto';

@Injectable()
export class DealersService {
  constructor(private readonly prisma: PrismaService) {}

  // Registration itself only ever produces a PENDING dealer — the
  // "✅ منشأة موثقة" badge (spec section 5) is granted by an admin after
  // documents are reviewed (see the admin module's stub), never here.
  // Promoting the owner's User.role to DEALER_OWNER happens regardless of
  // verification status: "is this account a dealer" (which app experience
  // it gets) and "is this dealer verified" (the trust badge, section 30)
  // are two different questions — the client's own document keeps them
  // separate (registration in section 5 vs. the ✅ badge granted after
  // review), and conflating them would leave a dealer stuck looking like
  // a plain customer in their own app until an admin acts.
  async register(ownerUserId: string, dto: RegisterDealerDto) {
    const [dealer] = await this.prisma.$transaction([
      this.prisma.dealer.create({
        data: {
          ownerUserId,
          businessName: dto.businessName,
          activityType: dto.activityType,
          commercialRegistryNo: dto.commercialRegistryNo,
          municipalLicenseNo: dto.municipalLicenseNo,
          contactName: dto.contactName,
          contactPhone: dto.contactPhone,
          city: dto.city,
          lat: dto.lat,
          lng: dto.lng,
        },
      }),
      this.prisma.user.update({
        where: { id: ownerUserId },
        data: { role: UserRole.DEALER_OWNER },
      }),
    ]);
    return dealer;
  }

  async findById(id: string) {
    const dealer = await this.prisma.dealer.findUnique({ where: { id } });
    if (!dealer) throw new NotFoundException('Dealer not found');
    return dealer;
  }

  // Backs the home screen's "تشاليح قريبة" / "أفضل التشاليح تقييمًا" rails
  // (spec section 6). Only ever surfaces VERIFIED dealers to customers —
  // the "✅ موثّق" badge (section 30) should mean something, not just be
  // decorative on a card next to unverified listings.
  async list(dto: ListDealersDto) {
    const dealers = await this.prisma.dealer.findMany({
      where: {
        verificationStatus: DealerVerificationStatus.VERIFIED,
        city: dto.city,
      },
      take: 20,
    });

    const withDistance = dealers.map((dealer) => ({
      ...dealer,
      distanceKm:
        dto.lat != null && dto.lng != null && dealer.lat != null && dealer.lng != null
          ? haversineKm(dto.lat, dto.lng, dealer.lat, dealer.lng)
          : null,
    }));

    switch (dto.sort) {
      case DealerSort.NEAREST:
        return withDistance.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
      case DealerSort.RATING:
        return withDistance.sort((a, b) => b.ratingAverage - a.ratingAverage);
      default:
        return withDistance;
    }
  }
}
