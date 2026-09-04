import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportReason } from '@prisma/client';

export class CreateReportDto {
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @IsOptional()
  @IsString()
  reportedDealerId?: string;

  @IsOptional()
  @IsString()
  reportedListingId?: string;

  @IsOptional()
  @IsString()
  details?: string;
}
