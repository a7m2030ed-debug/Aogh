import { IsOptional, IsString, MaxLength } from 'class-validator';

// Bounded because these land in the database verbatim and are rendered to
// the other party — an unbounded string field reachable by any logged-in
// account is a storage and rendering problem waiting to happen.
export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}
