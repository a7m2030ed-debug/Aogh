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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.dealersService.findById(id);
  }
}
