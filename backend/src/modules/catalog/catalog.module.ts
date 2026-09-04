import { Module } from '@nestjs/common';
import { CanonicalPartsController } from './canonical-parts.controller';
import { CanonicalPartsService } from './canonical-parts.service';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  controllers: [CanonicalPartsController, VehiclesController],
  providers: [CanonicalPartsService, VehiclesService],
  exports: [CanonicalPartsService, VehiclesService],
})
export class CatalogModule {}
