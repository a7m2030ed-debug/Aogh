import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// The three fields the customer fills in, plus the optional photo. Lengths
// are generous but bounded — these are free text typed on a phone, and an
// unbounded string is what turns a request feed into a spam surface.
export class CreatePartRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  partName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  vehicleMake!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  vehicleModel!: string;

  // Set from the URL returned by POST /media/uploads/presign after the app
  // uploads the photo directly to storage.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;
}
