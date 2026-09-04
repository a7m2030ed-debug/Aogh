import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

// Every sensitive admin action (spec section 35: "AuditLog يوثّق كل إجراء
// إداري حساس") should call record() — dealer verification/rejection,
// account suspension, listing takedown, report resolution.
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  record(adminUserId: string, action: string, entityType: string, entityId: string, metadata?: unknown) {
    return this.prisma.auditLog.create({
      data: { adminUserId, action, entityType, entityId, metadata: metadata as any },
    });
  }
}
