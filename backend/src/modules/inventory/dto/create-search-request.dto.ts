import { IsOptional, IsString } from 'class-validator';

export class CreateSearchRequestDto {
  @IsString()
  freeText!: string;

  @IsOptional()
  @IsString()
  canonicalPartId?: string;
}
