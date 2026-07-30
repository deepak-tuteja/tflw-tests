import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LoadAdminService, LoadResetResult } from './load-admin.service';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../entities/user.entity';

// perf-0 (PLAN_WEBV2_TARGETS.md §2) — admin-only, since a reset that deletes orders and rewrites
// stock has no business being reachable by an ordinary session; mirrors OrdersController's own
// `@Roles(UserRole.ADMIN)` pattern for other operationally-destructive endpoints (`fulfill`).
@ApiTags('load-admin')
@Controller('admin/load')
@UseGuards(AnyAuthGuard, RolesGuard)
export class LoadAdminController {
  constructor(private readonly loadAdmin: LoadAdminService) {}

  @Post('reset')
  @Roles(UserRole.ADMIN)
  reset(): Promise<LoadResetResult> {
    return this.loadAdmin.reset();
  }
}
