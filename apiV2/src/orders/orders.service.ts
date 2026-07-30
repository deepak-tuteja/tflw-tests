import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Product } from '../entities/product.entity';
import { Coupon, CouponType } from '../entities/coupon.entity';
import { OrderItemInputDto } from './dto/create-order.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { AuthedUser } from '../auth/guards/bearer-auth.guard';
import { UserRole } from '../entities/user.entity';
import { isUniqueViolation } from '../common/db-errors';
import { JobsService } from '../jobs/jobs.service';
import { Job } from '../entities/job.entity';
import { OrgsService } from '../orgs/orgs.service';

export interface CreateOrderResult {
  order: Order;
  created: boolean;
}

// RFC 4180 minimal quoting — none of this export's columns (uuid/enum/decimal/ISO-date/email)
// are expected to contain a comma/quote/newline, but quoting defensively costs nothing.
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Order-insensitive multiset comparison by (productId, quantity) — used by replayOrConflict to
// detect an Idempotency-Key reused with a genuinely different body (M19 finding).
function sameItems(
  existing: OrderItem[],
  requested: OrderItemInputDto[],
): boolean {
  if (existing.length !== requested.length) return false;
  const key = (productId: string, quantity: number) =>
    `${productId}:${quantity}`;
  const existingKeys = existing
    .map((item) => key(item.productId, item.quantity))
    .sort();
  const requestedKeys = requested
    .map((item) => key(item.productId, item.quantity))
    .sort();
  return existingKeys.every((k, i) => k === requestedKeys[i]);
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItems: Repository<OrderItem>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jobsService: JobsService,
    private readonly orgs: OrgsService,
  ) {}

  // Admin-only trigger (enforced by the controller's @Roles guard) for the 202-Accepted async
  // job cluster; findOneScoped still gives a clean 404 for a bad id.
  async fulfill(id: string, requester: AuthedUser): Promise<Job> {
    const order = await this.findOneScoped(id, requester);
    return this.jobsService.startFulfillment(order);
  }

  // Idempotency-Key (RFC-style, order-creation cluster): a repeated key returns the order that
  // key already produced instead of creating a duplicate. Scoped to the requesting user — reusing
  // someone else's key is a genuine conflict, not a valid replay. Postgres's `idempotency_key`
  // unique constraint treats NULLs as distinct, so requests with no key never collide with each
  // other; the constraint (not this pre-check) is what makes a concurrent duplicate safe.
  //
  // M15 (plan_v2.md Part H): the whole item-resolution + stock-decrement + coupon-application +
  // order-insert sequence runs inside one DB transaction — all-or-nothing. Shared by both
  // `POST /orders` (items from the request body, no coupon) and `POST /cart/checkout`
  // (CartService builds `items` from the cart's live contents and may pass a `couponCode`), so
  // stock/coupon logic can't silently diverge between the two entry points.
  async create(
    userId: string,
    items: OrderItemInputDto[],
    idempotencyKey?: string,
    couponCode?: string,
    webhookUrl?: string,
  ): Promise<CreateOrderResult> {
    if (idempotencyKey) {
      // `items` passed here (unlike CartService.checkout's call below) so a genuine body-mismatch
      // replay — the same key reused with different items — is caught rather than silently
      // returning the original order for a request that never actually happened (M19 finding).
      const replay = await this.findExistingByIdempotencyKey(
        idempotencyKey,
        userId,
        items,
      );
      if (replay) return replay;
    }

    try {
      const order = await this.dataSource.transaction((manager) =>
        this.persistOrderAtomically(
          manager,
          userId,
          items,
          idempotencyKey,
          couponCode,
          webhookUrl,
        ),
      );
      return { order, created: true };
    } catch (err) {
      if (idempotencyKey && isUniqueViolation(err)) {
        // Lost the race to a concurrent request using the same key — replay its result instead
        // of surfacing the constraint violation.
        const replay = await this.findExistingByIdempotencyKey(
          idempotencyKey,
          userId,
          items,
        );
        if (replay) return replay;
      }
      throw err;
    }
  }

  // Exposed (not just used internally by `create`) so a caller building its own request around
  // an idempotent order — CartService.checkout, specifically — can check for a replay *before*
  // doing anything that would only be valid for a genuinely new order (like requiring a non-empty
  // cart: a checkout's cart is already cleared by the original request by the time a legitimate
  // replay of the same key arrives). `expectedItems` is deliberately optional and omitted by
  // CartService: a legitimate cart-checkout replay's *current* cart is expected to already be
  // empty (cleared by the original request) or to have moved on entirely, so comparing it against
  // the stored order would misfire on the normal case, not just the mismatched one.
  async findExistingByIdempotencyKey(
    idempotencyKey: string,
    userId: string,
    expectedItems?: OrderItemInputDto[],
  ): Promise<CreateOrderResult | null> {
    const existing = await this.findByIdempotencyKey(idempotencyKey);
    return existing
      ? this.replayOrConflict(existing, userId, expectedItems)
      : null;
  }

  // Race-safe by construction, not by locking: the conditional `UPDATE ... WHERE stock >= :qty`
  // only ever succeeds if the row still has enough stock *at the moment it commits*, so two
  // concurrent transactions racing the same low-stock product can never both decrement past zero
  // — whichever commits second simply affects 0 rows and throws, rolling back its own attempt
  // (every item this same order already decremented rolls back with it — genuinely all-or-
  // nothing, not "some items succeeded, order failed anyway").
  private async persistOrderAtomically(
    manager: EntityManager,
    userId: string,
    items: OrderItemInputDto[],
    idempotencyKey: string | undefined,
    couponCode: string | undefined,
    webhookUrl: string | undefined,
  ): Promise<Order> {
    const orderItems: OrderItem[] = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await manager.findOne(Product, {
        where: { id: item.productId },
      });
      if (!product)
        throw new NotFoundException(`product ${item.productId} not found`);

      const result = await manager
        .createQueryBuilder()
        .update(Product)
        .set({ stock: () => 'stock - :qty' })
        .where('id = :id', { id: item.productId })
        .andWhere('stock >= :qty')
        .setParameter('qty', item.quantity)
        .execute();
      if (result.affected === 0) {
        throw new ConflictException(
          `insufficient stock for product "${product.name}"`,
        );
      }

      subtotal += Number(product.price) * item.quantity;
      orderItems.push(
        manager.create(OrderItem, {
          productId: product.id,
          quantity: item.quantity,
          unitPrice: product.price,
        }),
      );
    }

    const discountAmount = couponCode
      ? await this.applyCoupon(manager, couponCode, subtotal, userId)
      : null;

    // PLAN_ENTERPRISE_REGRESSION.md E3 — denormalized at creation time, null if the placing user
    // has no org membership (unaffected pre-E3 behavior).
    const membership = await this.orgs.getForUser(userId);

    const order = manager.create(Order, {
      userId,
      items: orderItems,
      idempotencyKey: idempotencyKey ?? null,
      couponCode: couponCode ?? null,
      discountAmount,
      webhookUrl: webhookUrl ?? null,
      orgId: membership?.orgId ?? null,
    });
    return manager.save(Order, order);
  }

  // Same atomic-conditional-update pattern as stock: `usedCount` only increments if the coupon
  // still has redemptions left *at commit time*, so a usage limit can't be oversold under
  // concurrent checkouts any more than stock can.
  private async applyCoupon(
    manager: EntityManager,
    code: string,
    subtotal: number,
    userId: string,
  ): Promise<string> {
    const coupon = await manager.findOne(Coupon, { where: { code } });
    if (!coupon) throw new NotFoundException('invalid coupon code');
    // PLAN_ENTERPRISE_REGRESSION.md E3 — a non-null orgId scopes redemption to that org's own
    // members (any orgRole — management vs. redemption are different permissions, see
    // CouponsService). Same "invalid coupon code" message as a genuinely nonexistent code, so a
    // checkout attempt from outside the org can't distinguish "wrong org" from "doesn't exist."
    if (coupon.orgId) {
      const membership = await this.orgs.getForUser(userId);
      if (!membership || membership.orgId !== coupon.orgId) {
        throw new NotFoundException('invalid coupon code');
      }
    }
    if (coupon.expiresAt.getTime() < Date.now()) {
      throw new UnprocessableEntityException('this coupon has expired');
    }
    if (subtotal < Number(coupon.minOrderAmount)) {
      throw new UnprocessableEntityException(
        `order subtotal (${subtotal.toFixed(2)}) is below this coupon's minimum of ${coupon.minOrderAmount}`,
      );
    }

    const result = await manager
      .createQueryBuilder()
      .update(Coupon)
      .set({ usedCount: () => 'used_count + 1' })
      .where('id = :id', { id: coupon.id })
      .andWhere('used_count < usage_limit')
      .execute();
    if (result.affected === 0) {
      throw new ConflictException('this coupon has reached its usage limit');
    }

    const discount =
      coupon.type === CouponType.PERCENT
        ? (subtotal * Number(coupon.value)) / 100
        : Number(coupon.value);
    return discount.toFixed(2);
  }

  private findByIdempotencyKey(idempotencyKey: string): Promise<Order | null> {
    return this.orders.findOne({
      where: { idempotencyKey },
      relations: { items: { product: { category: true } } },
    });
  }

  private replayOrConflict(
    existing: Order,
    userId: string,
    expectedItems?: OrderItemInputDto[],
  ): CreateOrderResult {
    if (existing.userId !== userId) {
      throw new ConflictException(
        'this Idempotency-Key was already used by another request',
      );
    }
    // M19 finding: previously unchecked, so reusing a key with a genuinely different body
    // silently replayed the *original* order with a 200 — indistinguishable from a legitimate
    // replay, no error, no trace of the caller's actual (different) request ever having happened.
    if (expectedItems && !sameItems(existing.items, expectedItems)) {
      throw new ConflictException(
        'this Idempotency-Key was already used with a different request body',
      );
    }
    return { order: existing, created: false };
  }

  findOwn(userId: string): Promise<Order[]> {
    return this.orders.find({
      where: { userId },
      // 3-level nesting (M6, plan_v2.md Part D decision 2): order -> items[] ->
      // product{name,price,category{name}}, on every order read.
      relations: { items: { product: { category: true } } },
      order: { createdAt: 'DESC' },
    });
  }

  findAllAdmin(): Promise<Order[]> {
    return this.orders.find({
      relations: { items: { product: { category: true } } },
      order: { createdAt: 'DESC' },
    });
  }

  // PLAN_ENTERPRISE_REGRESSION.md E3 — org-scoped sibling of findAllAdmin: not system-role RBAC,
  // an org owner/admin's own self-service view of every order placed by any member of their org
  // (findOwn above stays strictly per-user, unaffected). 403 for anyone without an owner/admin
  // membership, same "requires role" shape as an @Roles guard failure, since there's no org to
  // scope to.
  async findAllForOrg(requester: AuthedUser): Promise<Order[]> {
    const membership = await this.orgs.getForUser(requester.id);
    if (!this.orgs.isOwnerOrAdmin(membership)) {
      throw new ForbiddenException(
        'requires an owner or admin membership in an organization',
      );
    }
    return this.orders.find({
      where: { orgId: membership.orgId },
      relations: { items: { product: { category: true } } },
      order: { createdAt: 'DESC' },
    });
  }

  // PLAN_FILEFORMATS.md D5 — id,status,total,createdAt,ownerEmail; total is the same
  // items-minus-discount computation order-receipt.util.ts's PDF already does, just summed rather
  // than itemized.
  async exportCsv(): Promise<string> {
    const orders = await this.orders.find({
      relations: { items: true, user: true },
      order: { createdAt: 'DESC' },
    });

    const rows = orders.map((order) => {
      const itemsTotal = order.items.reduce(
        (sum, item) => sum + Number(item.unitPrice) * item.quantity,
        0,
      );
      const total = itemsTotal - Number(order.discountAmount ?? 0);
      return [
        order.id,
        order.status,
        total.toFixed(2),
        order.createdAt.toISOString(),
        order.user.email,
      ]
        .map(csvField)
        .join(',');
    });

    return ['id,status,total,createdAt,ownerEmail', ...rows].join('\n') + '\n';
  }

  async findOneScoped(id: string, requester: AuthedUser): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id },
      relations: { items: { product: { category: true } } },
    });
    if (!order) throw new NotFoundException('order not found');
    if (requester.role === UserRole.ADMIN || order.userId === requester.id) {
      return order;
    }
    // PLAN_ENTERPRISE_REGRESSION.md E3 — an org owner/admin also sees any order placed by a fellow
    // member of their own org; a member of a *different* org (or no org at all) still gets 403,
    // same as before this retrofit.
    const membership = await this.orgs.getForUser(requester.id);
    if (
      this.orgs.isOwnerOrAdmin(membership) &&
      membership.orgId === order.orgId
    ) {
      return order;
    }
    throw new ForbiddenException('not your order');
  }

  // PATCH /orders/:id/items/:itemId (M6, plan_v2.md Part D decision 3a) — a real nested-resource
  // partial update. Reuses findOneScoped's ownership/404 rule, then locates the item within the
  // already-scoped order (a 404 for an itemId that doesn't belong to *this* order, same as any
  // other scoped-nested-resource miss). Deliberately no ETag/If-Match here — OrderItem carries no
  // VersionColumn, out of scope this round (plan_v2.md Part D decision 3).
  async updateItem(
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemDto,
    requester: AuthedUser,
  ): Promise<OrderItem> {
    const order = await this.findOneScoped(orderId, requester);
    const item = order.items.find((it) => it.id === itemId);
    if (!item) throw new NotFoundException('order item not found');

    if (dto.quantity !== undefined) item.quantity = dto.quantity;

    return this.orderItems.save(item);
  }
}
