import { IsEnum, IsString, Matches } from 'class-validator';

// Keeps uploads segregated by what they're for — listing photos are
// public the moment a listing is published, dealer verification documents
// (spec section 5) never should be, so they can't share one blanket policy.
export enum UploadCategory {
  LISTING_PHOTO = 'listing-photo',
  LISTING_VIDEO = 'listing-video',
  DEALER_DOCUMENT = 'dealer-document',
}

export class PresignUploadDto {
  @IsEnum(UploadCategory)
  category!: UploadCategory;

  // e.g. "image/jpeg", "video/mp4" — validated loosely here; the storage
  // provider is the source of truth on what it'll actually accept.
  @IsString()
  @Matches(/^[a-z]+\/[a-z0-9.+-]+$/i)
  contentType!: string;
}
