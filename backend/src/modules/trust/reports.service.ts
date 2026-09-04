import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  create(authorUserId: string, dto: CreateReportDto) {
    return this.prisma.report.create({
      data: {
        authorUserId,
        reason: dto.reason,
        reportedDealerId: dto.reportedDealerId,
        reportedListingId: dto.reportedListingId,
        details: dto.details,
      },
    });
  }
}
