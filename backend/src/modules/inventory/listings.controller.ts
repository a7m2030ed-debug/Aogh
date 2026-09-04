import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListingAvailability } from '@prisma/client';
import { CurrentUser } from '../identity/current-user.decorator';
import { CreateListingDto } from './dto/create-listing.dto';
import { ListingsService } from './listings.service';

@ApiTags('inventory')
@Controller('inventory/listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  // NOTE: dealerId is taken from the authenticated user's dealer profile in
  // the real implementation (a lookup this skeleton leaves as a TODO) —
  // wiring it straight through here as a placeholder keeps the module
  // demonstrable without the full dealer-staff-permissions model.
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateListingDto) {
    return this.listingsService.create(user.userId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.listingsService.findById(id);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/availability')
  updateAvailability(
    @Param('id') id: string,
    @Body('availability') availability: ListingAvailability,
  ) {
    return this.listingsService.updateAvailability(id, availability);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/mark-sold')
  markSold(@Param('id') id: string) {
    return this.listingsService.markSold(id);
  }
}
