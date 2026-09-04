import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// Pairs with RolesGuard — put after @UseGuards(AuthGuard('jwt'), RolesGuard)
// so the JWT is verified first and role-checked second. Roles come from
// the same UserRole enum the JWT payload's `role` claim is signed with
// (auth.service.ts), so no separate admin login is needed for the pilot.
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
