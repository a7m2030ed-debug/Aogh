import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FulfillmentMethod } from '@prisma/client';

export class CreateOrderDto {
  @IsString()
  listingId!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsNumber()
  @Min(0)
  agreedPrice!: number;

  @IsEnum(FulfillmentMethod)
  fulfillment!: FulfillmentMethod;

  @IsOptional()
  @IsNumber()
  distanceKm?: number;
}
