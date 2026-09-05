import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CanonicalPartsService } from './canonical-parts.service';
import { CreateCanonicalPartDto } from './dto/create-canonical-part.dto';

@ApiTags('catalog')
@Controller('catalog/canonical-parts')
export class CanonicalPartsController {
  constructor(private readonly canonicalPartsService: CanonicalPartsService) {}

  // Read is open: the request form calls this for its part-name
  // suggestions, and a customer typing a part name isn't logged in yet on
  // first run. Writes are ADMIN-only — this dictionary is what every
  // customer sees suggested, so an open write endpoint is both a
  // data-integrity hole and a content-injection one.
  @Get()
  findAll() {
    return this.canonicalPartsService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateCanonicalPartDto) {
    return this.canonicalPartsService.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Post('bulk-import')
  bulkImport(@Body() rows: CreateCanonicalPartDto[]) {
    return this.canonicalPartsService.bulkUpsertByEnglishName(rows);
  }
}
