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
    // The health of this product is: are requests coming in, and are
    // dealers answering them? answeredRequests counts requests with at
    // least one conversation — the ratio against openRequests is the one
    // number that says whether the pilot is working.
    return Promise.all([
      this.prisma.user.count(),
      this.prisma.dealer.count({ where: { verificationStatus: 'VERIFIED' } }),
      this.prisma.partRequest.count(),
      this.prisma.partRequest.count({ where: { status: 'OPEN' } }),
      this.prisma.partRequest.count({ where: { conversations: { some: {} } } }),
    ]).then(([users, verifiedDealers, requests, openRequests, answeredRequests]) => ({
      users,
      verifiedDealers,
      requests,
      openRequests,
      answeredRequests,
    }));
  }
}
