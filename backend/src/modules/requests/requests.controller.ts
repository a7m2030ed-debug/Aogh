import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
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
  // Every request here wakes up every dealer's phone, so one account
  // posting in a loop is a spam amplifier aimed at the people the whole
  // product depends on. Ten an hour is far above honest use.
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
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
