import {
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

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
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

    const order = this.orders.create({ userId, items });
    return this.orders.save(order);
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
