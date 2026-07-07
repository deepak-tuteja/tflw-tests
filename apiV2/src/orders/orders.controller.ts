import { Body, Controller, Get, Headers, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';
import { UserRole } from '../entities/user.entity';

@ApiTags('orders')
@Controller('orders')
@UseGuards(AnyAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // Idempotency-Key (M3): a repeated key on a repeated request returns the original order (200)
  // instead of creating a duplicate (201) — the status code itself tells a replaying client
  // whether anything new happened.
  @Post()
  async create(
    @CurrentUser() user: AuthedUser,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { order, created } = await this.orders.create(user.id, dto, idempotencyKey);
    res.status(created ? 201 : 200);
    return order;
  }

  @Get()
  findOwn(@CurrentUser() user: AuthedUser) {
    return this.orders.findOwn(user.id);
  }

  // Demonstrates RBAC (not ownership-scoping): only an admin role can list every order.
  @Get('all')
  @Roles(UserRole.ADMIN)
  findAllAdmin() {
    return this.orders.findAllAdmin();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    return this.orders.findOneScoped(id, user);
  }

  // Nested sub-resource (plan_v2.md Part A) — same ownership scoping as the parent, just
  // projected down to the line items.
  @Get(':id/items')
  async findItems(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    const order = await this.orders.findOneScoped(id, user);
    return order.items;
  }

  // 202-Accepted async job (M4): the fulfillment itself happens after this request returns —
  // the response is just the pollable job handle, via `Location` and the body alike.
  @Post(':id/fulfill')
  @Roles(UserRole.ADMIN)
  async fulfill(
    @Param('id') id: string,
    @CurrentUser() user: AuthedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const job = await this.orders.fulfill(id, user);
    res.status(202);
    res.setHeader('Location', `/v1/jobs/${job.id}`);
    return { jobId: job.id, status: job.status };
  }
}
