import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/current-user.decorator';
import { CreateSearchRequestDto } from './dto/create-search-request.dto';
import { SubmitSearchRequestOfferDto } from './dto/submit-search-request-offer.dto';
import { SearchRequestsService } from './search-requests.service';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('inventory/search-requests')
export class SearchRequestsController {
  constructor(private readonly searchRequestsService: SearchRequestsService) {}

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateSearchRequestDto) {
    return this.searchRequestsService.create(user.userId, dto);
  }

  @Get('open')
  openForDealers() {
    return this.searchRequestsService.findOpenForDealer();
  }

  @Post(':id/offers')
  submitOffer(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: SubmitSearchRequestOfferDto,
  ) {
    // dealerId should resolve from the authenticated dealer's profile;
    // left as user.userId here for the same reason noted in
    // listings.controller.ts — full dealer-staff auth is future work.
    return this.searchRequestsService.submitOffer(id, user.userId, dto);
  }
}
