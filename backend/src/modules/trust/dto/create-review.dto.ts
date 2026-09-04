import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @IsString()
  orderId!: string;

  @IsOptional()
  @IsString()
  targetDealerId?: string;

  @IsOptional()
  @IsString()
  targetUserId?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  stars!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
