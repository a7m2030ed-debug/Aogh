import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ListingCondition } from '@prisma/client';

export enum SearchSort {
  RELEVANCE = 'relevance',
  CHEAPEST = 'cheapest',
  NEAREST = 'nearest',
  RATING = 'rating',
  NEWEST = 'newest',
}

// Filters map directly to spec section 19 ("الفلاتر"). The review
// recommends shipping only price/distance/condition/newest in v1 and
// adding the rest once real usage is visible — this DTO already models
// all of them so that trim-down is a UI decision, not a backend one.
export class SearchListingsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @IsOptional()
  @IsEnum(ListingCondition)
  condition?: ListingCondition;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxDistanceKm?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(SearchSort)
  sort?: SearchSort;
}
