import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';
import { Product } from '../entities/product.entity';
import { OrdersService, CreateOrderResult } from '../orders/orders.service';
import { isUniqueViolation } from '../common/db-errors';

export interface CartView {
  id: string | null;
  items: CartItem[];
}

// One cart per user, no creation step (M15, plan_v2.md Part H decision 3) — a cart row is
// upserted lazily on first `POST /cart/items`. Stock is deliberately never checked here; it's
// enforced exactly once, atomically, at `checkout` via OrdersService's shared order-creation
// path (decision 5) — this service never decrements stock itself.
@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart) private readonly carts: Repository<Cart>,
    @InjectRepository(CartItem) private readonly cartItems: Repository<CartItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly orders: OrdersService,
  ) {}

  async findForUser(userId: string): Promise<CartView> {
    const cart = await this.carts.findOne({
      where: { userId },
      relations: { items: { product: true } },
    });
    return cart ? { id: cart.id, items: cart.items } : { id: null, items: [] };
  }

  async addItem(userId: string, productId: string, quantity: number): Promise<CartItem> {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException(`product ${productId} not found`);

    const cart = await this.getOrCreateCart(userId);
    const existing = await this.cartItems.findOne({ where: { cartId: cart.id, productId } });
    if (existing) {
      // Atomic increment, not read-modify-write (M19 finding: 5 concurrent +1 requests against
      // an existing line each read the same stale quantity and clobbered each other's write,
      // losing 4 of 5 increments — the same lost-update class M15 already fixed for stock, cart
      // quantity just never got the same treatment).
      await this.cartItems.increment({ id: existing.id }, 'quantity', quantity);
      return this.cartItems.findOneOrFail({ where: { id: existing.id } });
    }
    try {
      return await this.cartItems.save(this.cartItems.create({ cartId: cart.id, productId, quantity }));
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Lost a race to insert this cart's first row for this product — the winner's row is
        // now `existing` from the concurrent request's perspective; fold this one into it too.
        await this.cartItems.increment({ cartId: cart.id, productId }, 'quantity', quantity);
        return this.cartItems.findOneOrFail({ where: { cartId: cart.id, productId } });
      }
      throw err;
    }
  }

  async updateItem(userId: string, itemId: string, quantity: number): Promise<CartItem> {
    const item = await this.findOwnItem(userId, itemId);
    item.quantity = quantity;
    return this.cartItems.save(item);
  }

  async removeItem(userId: string, itemId: string): Promise<void> {
    const item = await this.findOwnItem(userId, itemId);
    await this.cartItems.remove(item);
  }

  // All-or-nothing checkout (decision 3): builds the order-items list from the cart's *current*
  // contents and hands off to the same atomic order-creation path `POST /orders` uses — if any
  // item's stock (or the coupon) fails, the whole transaction rolls back and the cart is left
  // untouched (a shopper can just retry after adjusting quantities). Only cleared on a genuinely
  // new order — a replayed Idempotency-Key request must not re-clear an already-cleared cart.
  async checkout(
    userId: string,
    couponCode: string | undefined,
    idempotencyKey: string | undefined,
  ): Promise<CreateOrderResult> {
    // Checked before the empty-cart guard below: a legitimate replay arrives *after* the
    // original request already cleared the cart, so "cart is empty" must never block it.
    if (idempotencyKey) {
      const replay = await this.orders.findExistingByIdempotencyKey(idempotencyKey, userId);
      if (replay) return replay;
    }

    const cart = await this.carts.findOne({ where: { userId }, relations: { items: true } });
    if (!cart || cart.items.length === 0) {
      throw new UnprocessableEntityException('cart is empty');
    }

    const items = cart.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    const result = await this.orders.create(userId, items, idempotencyKey, couponCode);
    if (result.created) {
      await this.cartItems.delete({ cartId: cart.id });
    }
    return result;
  }

  private async getOrCreateCart(userId: string): Promise<Cart> {
    const existing = await this.carts.findOne({ where: { userId } });
    if (existing) return existing;

    try {
      return await this.carts.save(this.carts.create({ userId }));
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Lost a race to create this user's cart concurrently — reuse the winner's row.
        const winner = await this.carts.findOne({ where: { userId } });
        if (winner) return winner;
      }
      throw err;
    }
  }

  private async findOwnItem(userId: string, itemId: string): Promise<CartItem> {
    const cart = await this.carts.findOne({ where: { userId } });
    const item = cart ? await this.cartItems.findOne({ where: { id: itemId, cartId: cart.id } }) : null;
    if (!item) throw new NotFoundException('cart item not found');
    return item;
  }
}
