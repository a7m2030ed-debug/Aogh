import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterDealerDto } from './dto/register-dealer.dto';

@Injectable()
export class DealersService {
  constructor(private readonly prisma: PrismaService) {}

  // Registration itself only ever produces a PENDING dealer — the
  // "✅ منشأة موثقة" badge (spec section 5) is granted by an admin after
  // documents are reviewed (see the admin module's stub), never here.
  async register(ownerUserId: string, dto: RegisterDealerDto) {
    return this.prisma.dealer.create({
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
    });
  }

  async findById(id: string) {
    const dealer = await this.prisma.dealer.findUnique({ where: { id } });
    if (!dealer) throw new NotFoundException('Dealer not found');
    return dealer;
  }
}
