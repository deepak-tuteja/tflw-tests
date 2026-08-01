import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { Order } from '../entities/order.entity';
import { Ticket } from '../entities/ticket.entity';
import { User } from '../entities/user.entity';
import {
  LOAD_HOT_PRODUCT_BASELINE_STOCK,
  LOAD_HOT_PRODUCT_NAME,
  LOAD_USER_EMAIL,
} from './load-target.constants';

export interface LoadResetResult {
  hotProductStockReset: number;
  ordersDeleted: number;
  ticketsDeleted: number;
}

@Injectable()
export class LoadAdminService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  // perf-0 (PLAN_WEBV2_TARGETS.md §2, D16) — a fast reset usable between `tflw load` runs,
  // deliberately not the docker-rebuild teardown the functional regression sweep uses (that's
  // minutes per cycle, unusable for iterative load-test tuning). Scoped to only the load user's
  // own orders (cascades to order_items at the DB level) and the one hot product's stock, so
  // functional-suite fixture data is never touched.
  async reset(): Promise<LoadResetResult> {
    const hotProduct = await this.products.findOne({
      where: { name: LOAD_HOT_PRODUCT_NAME },
    });
    if (!hotProduct) {
      throw new NotFoundException(
        `load target product "${LOAD_HOT_PRODUCT_NAME}" not seeded — run the seed step first`,
      );
    }
    await this.products.update(hotProduct.id, {
      stock: LOAD_HOT_PRODUCT_BASELINE_STOCK,
    });

    const loadUser = await this.users.findOne({
      where: { email: LOAD_USER_EMAIL },
    });
    if (!loadUser) {
      throw new NotFoundException(
        `load user "${LOAD_USER_EMAIL}" not seeded — run the seed step first`,
      );
    }
    const deleteResult = await this.orders.delete({ userId: loadUser.id });

    // M48 (PLAN_BROWSER_PERF_SECURITY.md §2.20, D82) — the ticket-write rung's own cleanup, same
    // reasoning as the orders delete above: `tickets_events.ticket_id` cascades at the DB level
    // (onDelete: CASCADE), so this one delete clears both tables.
    const ticketsDeleteResult = await this.tickets.delete({
      submittedBy: loadUser.id,
    });

    return {
      hotProductStockReset: LOAD_HOT_PRODUCT_BASELINE_STOCK,
      ordersDeleted: deleteResult.affected ?? 0,
      ticketsDeleted: ticketsDeleteResult.affected ?? 0,
    };
  }
}
