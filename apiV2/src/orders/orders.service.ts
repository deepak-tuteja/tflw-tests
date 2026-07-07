import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Product } from '../entities/product.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { AuthedUser } from '../auth/guards/bearer-auth.guard';
import { UserRole } from '../entities/user.entity';
import { isUniqueViolation } from '../common/db-errors';
import { JobsService } from '../jobs/jobs.service';
import { Job } from '../entities/job.entity';

export interface CreateOrderResult {
  order: Order;
  created: boolean;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly jobsService: JobsService,
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
  async create(
    userId: string,
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<CreateOrderResult> {
    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(idempotencyKey);
      if (existing) return this.replayOrConflict(existing, userId);
    }

    const items = await Promise.all(
      dto.items.map(async (item) => {
        const product = await this.products.findOne({ where: { id: item.productId } });
        if (!product) {
          throw new NotFoundException(`product ${item.productId} not found`);
        }
        return this.orderItems.create({
          productId: product.id,
          quantity: item.quantity,
          unitPrice: product.price,
        });
      }),
    );

    const order = this.orders.create({ userId, items, idempotencyKey: idempotencyKey ?? null });
    try {
      const saved = await this.orders.save(order);
      return { order: saved, created: true };
    } catch (err) {
      if (idempotencyKey && isUniqueViolation(err)) {
        // Lost the race to a concurrent request using the same key — replay its result instead
        // of surfacing the constraint violation.
        const existing = await this.findByIdempotencyKey(idempotencyKey);
        if (existing) return this.replayOrConflict(existing, userId);
      }
      throw err;
    }
  }

  private findByIdempotencyKey(idempotencyKey: string): Promise<Order | null> {
    return this.orders.findOne({ where: { idempotencyKey }, relations: { items: true } });
  }

  private replayOrConflict(existing: Order, userId: string): CreateOrderResult {
    if (existing.userId !== userId) {
      throw new ConflictException('this Idempotency-Key was already used by another request');
    }
    return { order: existing, created: false };
  }

  findOwn(userId: string): Promise<Order[]> {
    return this.orders.find({
      where: { userId },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
  }

  findAllAdmin(): Promise<Order[]> {
    return this.orders.find({
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneScoped(id: string, requester: AuthedUser): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException('order not found');
    if (requester.role !== UserRole.ADMIN && order.userId !== requester.id) {
      throw new ForbiddenException('not your order');
    }
    return order;
  }
}
