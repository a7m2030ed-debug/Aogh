import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/current-user.decorator';
import { CreateReviewDto } from './dto/create-review.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { ReviewsService } from './reviews.service';
import { ReportsService } from './reports.service';

@ApiTags('trust')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller()
export class TrustController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly reportsService: ReportsService,
  ) {}

  @Post('reviews')
  createReview(@CurrentUser() user: { userId: string }, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(user.userId, dto);
  }

  @Post('reports')
  createReport(@CurrentUser() user: { userId: string }, @Body() dto: CreateReportDto) {
    return this.reportsService.create(user.userId, dto);
  }
}
