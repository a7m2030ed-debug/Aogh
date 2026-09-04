import { Module } from '@nestjs/common';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchRequestsController } from './search-requests.controller';
import { SearchRequestsService } from './search-requests.service';

@Module({
  controllers: [ListingsController, SearchController, SearchRequestsController],
  providers: [ListingsService, SearchService, SearchRequestsService],
  exports: [ListingsService, SearchService],
})
export class InventoryModule {}
