import { IsNumber, Min } from 'class-validator';

export class ProposePriceDto {
  @IsNumber()
  @Min(0)
  price!: number;
}
