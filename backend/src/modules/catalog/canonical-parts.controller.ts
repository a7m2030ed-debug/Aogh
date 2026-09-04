import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CanonicalPartsService } from './canonical-parts.service';
import { CreateCanonicalPartDto } from './dto/create-canonical-part.dto';

@ApiTags('catalog')
@Controller('catalog/canonical-parts')
export class CanonicalPartsController {
  constructor(private readonly canonicalPartsService: CanonicalPartsService) {}

  @Post()
  create(@Body() dto: CreateCanonicalPartDto) {
    return this.canonicalPartsService.create(dto);
  }

  @Get()
  findAll() {
    return this.canonicalPartsService.findAll();
  }

  @Post('bulk-import')
  bulkImport(@Body() rows: CreateCanonicalPartDto[]) {
    return this.canonicalPartsService.bulkUpsertByEnglishName(rows);
  }
}
