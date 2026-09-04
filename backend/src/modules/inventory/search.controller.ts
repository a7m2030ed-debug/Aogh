import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchListingsDto } from './dto/search-listings.dto';
import { SearchService } from './search.service';

@ApiTags('inventory')
@Controller('inventory/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Query() dto: SearchListingsDto, @Req() req: any) {
    // Optional: attach the caller's userId if a JWT happens to be present,
    // without requiring auth — search must work for anonymous browsing.
    const userId = req.user?.userId as string | undefined;
    return this.searchService.search(dto, userId);
  }
}
