import { IsInt, IsOptional, IsString, IsUrl } from 'class-validator';

export class RecognizePartDto {
  @IsUrl({ require_tld: false })
  imageUrl!: string;

  @IsOptional()
  @IsString()
  knownVehicleModelId?: string;

  @IsOptional()
  @IsInt()
  knownVehicleYear?: number;
}
