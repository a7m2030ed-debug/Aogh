import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';

@ApiTags('catalog')
@Controller('catalog/vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get('makes')
  makes() {
    return this.vehiclesService.findMakes();
  }

  @Get('models')
  models(@Query('makeId') makeId: string) {
    return this.vehiclesService.findModelsByMake(makeId);
  }
}
