import { IsArray, IsOptional, IsString } from 'class-validator';

// This is the entity the technical review calls the single most important
// missing piece: without a canonical name + synonym list, "صدام" / "بمبر" /
// "Front Bumper" stay three unrelated strings and search + AI drift apart.
export class CreateCanonicalPartDto {
  @IsString()
  categoryId!: string;

  @IsString()
  canonicalNameAr!: string;

  @IsString()
  canonicalNameEn!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  synonyms?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  oemNumbers?: string[];
}
