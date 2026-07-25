import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { UsersService, etagFor } from './users.service';
import type { UpdateAttributesDto } from './dto/update-attributes.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';

// Self-service only (PLAN_LIFECYCLE.md L1 decision 3): every route here is scoped to the
// caller's own id via CurrentUser — no admin-driven user management.
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @UseGuards(AnyAuthGuard)
  async me(
    @CurrentUser() user: AuthedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const profile = await this.users.profile(user.id);
    res.setHeader('ETag', etagFor(profile));
    return profile;
  }

  // If-Match conditional PATCH (RFC7232), same optimistic-concurrency courtesy check as
  // products.controller.ts's update().
  @Patch('me')
  @UseGuards(AnyAuthGuard)
  async updateAttributes(
    @CurrentUser() user: AuthedUser,
    @Body() body: UpdateAttributesDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const updated = await this.users.patchAttributes(user.id, body, ifMatch);
    res.setHeader('ETag', etagFor(updated));
    return updated;
  }

  // Soft, asynchronous account deletion (PLAN_LIFECYCLE.md L2): 202 + a pollable job, same shape
  // as order fulfillment — poll `GET /jobs/:id` for completion.
  @Delete('me')
  @HttpCode(202)
  @UseGuards(AnyAuthGuard)
  deleteMe(@CurrentUser() user: AuthedUser) {
    return this.users.requestDeletion(user.id);
  }
}
