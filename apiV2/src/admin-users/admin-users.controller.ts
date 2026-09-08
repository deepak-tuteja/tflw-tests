import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminUsersService, UserRoleView } from './admin-users.service';
import { SetUserRoleDto } from './dto/set-user-role.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../entities/user.entity';

// `M182b` (`D938`) — admin-driven role management, and its own module on purpose.
//
// PLAN_LIFECYCLE.md L1 decision 3 says "no admin-driven user management" and `UsersController`'s
// header repeats it as an invariant about *that controller*: every route there is scoped to the
// caller's own id via CurrentUser. That invariant is worth keeping literally true, so this route
// does not join it — the decision is amended in PLAN_LIFECYCLE.md on its own terms, and the code
// lands in the shape `load-admin` already established for an admin-only operation that has no
// self-service counterpart.
//
// What it exists for: `tests/api/admin/tickets.tflw`'s collection-level `wait until` counted rows
// that outlive the run, because its assignee was a *seeded* agent and every prior run's breached
// tickets were still assigned to them (`M181-01`). A test cannot mint an agent through the public
// API — `POST /auth/register` hardcodes `role: USER` and `PATCH /tickets/:id/assign` refuses a
// non-AGENT assignee with 422 — so the count could never be scoped to one run. This is the one
// missing verb.
@ApiTags('admin-users')
@Controller('admin/users')
@UseGuards(AnyAuthGuard, RolesGuard)
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  // Deliberately unguarded: an admin may demote themselves, and the last admin may be demoted.
  // Both are reachable and neither is defended, because the guard that would prevent them is a
  // claim about *operating* this app and this app is a test target — a rule nothing in the suite
  // exercises is a rule nothing in the suite could notice breaking.
  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  setRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetUserRoleDto,
  ): Promise<UserRoleView> {
    return this.adminUsers.setRole(id, body);
  }
}
