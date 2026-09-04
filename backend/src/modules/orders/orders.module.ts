import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { DeliveryFeeCalculator } from './delivery-fee.calculator';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, DeliveryFeeCalculator],
  exports: [OrdersService],
})
export class OrdersModule {}
