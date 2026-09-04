import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DealerVerificationStatus } from '@prisma/client';

export class DecideDealerVerificationDto {
  @IsEnum(DealerVerificationStatus)
  status!: DealerVerificationStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
