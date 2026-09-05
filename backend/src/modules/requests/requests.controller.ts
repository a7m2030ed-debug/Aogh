import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/current-user.decorator';
import { DealersService } from '../identity/dealers.service';
import { RequestsService } from './requests.service';
import { CreatePartRequestDto } from './dto/create-part-request.dto';
import { AnswerRequestDto } from './dto/answer-request.dto';

@ApiTags('requests')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly dealersService: DealersService,
  ) {}

  // ── Customer side ──────────────────────────────────────────────────
  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreatePartRequestDto) {
    return this.requestsService.create(user.userId, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: { userId: string }) {
    return this.requestsService.listMine(user.userId);
  }

  // ── Dealer side ────────────────────────────────────────────────────
  // Declared before ':id' so "inbox" isn't swallowed as an id.
  @Get('inbox')
  async inbox(@CurrentUser() user: { userId: string }) {
    const dealer = await this.dealersService.findByOwner(user.userId);
    return this.requestsService.listOpenForDealer(dealer.id);
  }

  @Post(':id/answer')
  async answer(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: AnswerRequestDto,
  ) {
    const dealer = await this.dealersService.findByOwner(user.userId);
    return this.requestsService.answer(dealer.id, id, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.requestsService.findMine(user.userId, id);
  }

  @Patch(':id/close')
  close(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.requestsService.close(user.userId, id);
  }
}
