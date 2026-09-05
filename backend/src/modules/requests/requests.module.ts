import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

// Depends on IdentityModule for DealersService (resolving a logged-in
// dealer account to its dealerId) — a sanctioned cross-module service
// call, as opposed to reaching into another module's tables directly.
@Module({
  imports: [IdentityModule],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
