import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

export class SubmitSearchRequestOfferDto {
  @IsBoolean()
  available!: boolean;

  @IsOptional()
  @IsNumber()
  price?: number;
}
