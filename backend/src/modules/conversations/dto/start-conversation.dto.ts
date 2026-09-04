import { IsOptional, IsString } from 'class-validator';

export class StartConversationDto {
  @IsString()
  dealerId!: string;

  @IsOptional()
  @IsString()
  listingId?: string;
}
