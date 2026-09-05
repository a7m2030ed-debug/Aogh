import { IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Fields mirror spec section 5, plus the municipal-license field the
// technical review adds (section 4.1): the new municipal requirements for
// vehicle-teardown/used-parts shops are separate from the general
// commercial registry, so they get their own verification field rather
// than being folded into commercialRegistryNo.
//
// Everything is length-bounded: these strings are shown to customers next
// to a "موثّق" badge, and an unbounded one is both a storage problem and a
// way to push junk into someone else's screen. lat/lng use the coordinate
// validators rather than a bare @IsNumber so an out-of-range value is
// rejected at the edge instead of stored.
export class RegisterDealerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  businessName!: string;

  @IsString()
  @MaxLength(80)
  activityType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  commercialRegistryNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  municipalLicenseNo?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  contactName!: string;

  @IsString()
  @MaxLength(20)
  contactPhone!: string;

  @IsString()
  @MaxLength(60)
  city!: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;
}
