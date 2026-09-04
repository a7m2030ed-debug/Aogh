import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/current-user.decorator';
import { AdminService } from './admin.service';
import { DecideDealerVerificationDto } from './dto/decide-dealer-verification.dto';

// TODO: replace the plain JWT guard with a dedicated admin-role guard once
// AdminUser has its own auth flow — every route here is a placeholder for
// that, not something to expose to regular users as-is.
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dealers/pending')
  pendingDealers() {
    return this.adminService.pendingDealers();
  }

  @Patch('dealers/:id/verification')
  decideVerification(
    @Param('id') id: string,
    @CurrentUser() admin: { userId: string },
    @Body() dto: DecideDealerVerificationDto,
  ) {
    return this.adminService.decideDealerVerification(admin.userId, id, dto);
  }

  @Get('dashboard/counts')
  dashboardCounts() {
    return this.adminService.dashboardCounts();
  }
}
