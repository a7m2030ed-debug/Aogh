import { IsNumber, IsOptional, IsString } from 'class-validator';

// Fields mirror spec section 5, plus the municipal-license field the
// technical review adds (section 4.1): the new municipal requirements for
// vehicle-teardown/used-parts shops are separate from the general
// commercial registry, so they get their own verification field rather
// than being folded into commercialRegistryNo.
export class RegisterDealerDto {
  @IsString()
  businessName!: string;

  @IsString()
  activityType!: string;

  @IsOptional()
  @IsString()
  commercialRegistryNo?: string;

  @IsOptional()
  @IsString()
  municipalLicenseNo?: string;

  @IsString()
  contactName!: string;

  @IsString()
  contactPhone!: string;

  @IsString()
  city!: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}
