import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './current-user.decorator';
import { DealersService } from './dealers.service';
import { RegisterDealerDto } from './dto/register-dealer.dto';

@ApiTags('dealers')
@Controller('dealers')
export class DealersController {
  constructor(private readonly dealersService: DealersService) {}

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('register')
  register(
    @CurrentUser() user: { userId: string },
    @Body() dto: RegisterDealerDto,
  ) {
    return this.dealersService.register(user.userId, dto);
  }

  // Kept for the customer to see who answered their request (the dealer
  // card in a conversation). There's no browse/list endpoint any more —
  // customers reach dealers only through an answered request, so this
  // requires a session rather than being open to anyone who can guess ids.
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.dealersService.findById(id);
  }
}
