import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser } from '../identity/current-user.decorator';
import { AdminService } from './admin.service';
import { DecideDealerVerificationDto } from './dto/decide-dealer-verification.dto';

// Gated to User.role === ADMIN (RolesGuard runs after AuthGuard('jwt') has
// verified the token). There's no admin self-signup by design — promote a
// real user with `npm run promote:admin -- <phone>` (see package.json /
// backend/README.md). AdminUser (prisma/schema.prisma) stays a separate
// audit-attribution table, not a second login system — see the client
// decision recorded in docs/project-brief.md.
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
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
