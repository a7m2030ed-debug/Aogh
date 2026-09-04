import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ListingCondition } from '@prisma/client';

export class CreateListingDto {
  @IsString()
  canonicalPartId!: string;

  @IsOptional()
  @IsString()
  vehicleModelId?: string;

  @IsOptional()
  @IsInt()
  vehicleYear?: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsEnum(ListingCondition)
  condition!: ListingCondition;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  aiSuggested?: boolean;

  @IsOptional()
  @IsNumber()
  aiConfidence?: number;
}
