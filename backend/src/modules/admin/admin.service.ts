import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import { DecideDealerVerificationDto } from './dto/decide-dealer-verification.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  pendingDealers() {
    return this.prisma.dealer.findMany({
      where: { verificationStatus: 'PENDING' },
      include: { documents: true },
    });
  }

  async decideDealerVerification(adminUserId: string, dealerId: string, dto: DecideDealerVerificationDto) {
    const dealer = await this.prisma.dealer.update({
      where: { id: dealerId },
      data: { verificationStatus: dto.status },
    });
    await this.auditLog.record(adminUserId, 'dealer.verification_decided', 'Dealer', dealerId, dto);
    return dealer;
  }

  dashboardCounts() {
    // Backs the "التقارير" section of the admin dashboard (spec section
    // 35): counts only for now, the "أكثر القطع بحثًا" style breakdowns
    // read from SearchQuery/Order once there's enough volume to be
    // meaningful.
    return Promise.all([
      this.prisma.user.count(),
      this.prisma.dealer.count(),
      this.prisma.inventoryListing.count(),
      this.prisma.searchQuery.count(),
      this.prisma.order.count({ where: { status: 'CLOSED' } }),
    ]).then(([users, dealers, listings, searches, completedOrders]) => ({
      users,
      dealers,
      listings,
      searches,
      completedOrders,
    }));
  }
}
