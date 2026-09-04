import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { CurrentUser } from '../identity/current-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.userId, dto);
  }

  @Get()
  listMine(@CurrentUser() user: { userId: string }) {
    return this.ordersService.listForCustomer(user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: OrderStatus,
    @Body('note') note?: string,
  ) {
    return this.ordersService.updateStatus(id, status, note);
  }
}
