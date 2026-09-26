import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';
import { OrdersService } from '../orders/orders.service';

// `S-3a` (decision 16): the slow order-tracking page. `?delayMs=` holds the answer back, capped
// at 10 s, so a journey can write `wait until` against a page that is genuinely late and a step
// timeout against one that is later than the step allows. Scoped exactly as the order is: an
// order someone else placed is a 404 here as it is at `GET /orders/:id`.
const MAX_DELAY_MS = 10_000;

@ApiTags('storefront')
@Controller('orders/:id/tracking')
@UseGuards(AnyAuthGuard)
export class TrackingController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  async track(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
    @Query('delayMs') delayMs: string | undefined,
  ) {
    const order = await this.orders.findOneScoped(id, user);
    const wait = Math.min(Math.max(Number(delayMs ?? 0) || 0, 0), MAX_DELAY_MS);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    return {
      orderId: order.id,
      status: order.status,
      events: [
        { at: order.createdAt, label: 'order placed' },
        { at: order.createdAt, label: `status: ${order.status}` },
      ],
      delayedMs: wait,
    };
  }
}
