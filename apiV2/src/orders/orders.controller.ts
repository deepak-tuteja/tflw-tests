import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { buildOrderReceiptPdf } from './order-receipt.util';
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
    const { order, created } = await this.orders.create(
      user.id,
      dto.items,
      idempotencyKey,
    );
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
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.orders.findOneScoped(id, user);
  }

  // Nested sub-resource (plan_v2.md Part A) — same ownership scoping as the parent, just
  // projected down to the line items.
  @Get(':id/items')
  async findItems(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
  ) {
    const order = await this.orders.findOneScoped(id, user);
    return order.items;
  }

  // Binary/file-serving response (M32, plan_v2.md Part R Cluster B) — a real PDF body, same
  // ownership scoping as the parent order. `StreamableFile` (not a plain `Buffer` return) is
  // deliberate: NestJS's default response path treats a returned object as JSON, which would
  // mangle raw bytes; `StreamableFile` is Nest's own escape hatch for exactly this.
  @Get(':id/receipt')
  async receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const order = await this.orders.findOneScoped(id, user);
    const pdf = buildOrderReceiptPdf(order);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${order.id}.pdf"`,
    });
    return new StreamableFile(pdf);
  }

  // Nested-item PATCH (M6, plan_v2.md Part D decision 3a) — same ownership scoping as the parent
  // order; no @Roles restriction, since a user updating their own order's item is the normal case
  // (admin covered by findOneScoped's role check too).
  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateOrderItemDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.orders.updateItem(id, itemId, dto, user);
  }

  // 202-Accepted async job (M4): the fulfillment itself happens after this request returns —
  // the response is just the pollable job handle, via `Location` and the body alike.
  @Post(':id/fulfill')
  @Roles(UserRole.ADMIN)
  async fulfill(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const job = await this.orders.fulfill(id, user);
    res.status(202);
    res.setHeader('Location', `/v1/jobs/${job.id}`);
    return { jobId: job.id, status: job.status };
  }
}
