import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './current-user.decorator';
import { DealersService } from './dealers.service';
import { RegisterDealerDto } from './dto/register-dealer.dto';
import { ListDealersDto } from './dto/list-dealers.dto';

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

  // Registered before ':id' so a literal path segment here is never
  // swallowed as an :id value — not an issue for the empty path itself,
  // but keeps the ordering convention consistent with the rest of the app.
  @Get()
  list(@Query() dto: ListDealersDto) {
    return this.dealersService.list(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.dealersService.findById(id);
  }
}
