import { Module } from '@nestjs/common';
import { TrustController } from './trust.controller';
import { ReviewsService } from './reviews.service';
import { ReportsService } from './reports.service';

@Module({
  controllers: [TrustController],
  providers: [ReviewsService, ReportsService],
  exports: [ReviewsService, ReportsService],
})
export class TrustModule {}
