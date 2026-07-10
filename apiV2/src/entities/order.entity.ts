import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.orders, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  // Postgres unique constraints treat NULL as distinct, so repeated non-idempotent
  // requests (no key) never collide; only a reused key does. Backs the
  // Idempotency-Key cluster (M3).
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    nullable: true,
    unique: true,
  })
  idempotencyKey: string | null;

  // Coupon record (M15, plan_v2.md Part H decision 4) — set only when `POST /cart/checkout` was
  // given a valid `couponCode`; `discountAmount` is the computed, persisted discount so a client
  // never has to recompute it from the coupon's type/value after the fact. Direct `POST /orders`
  // never sets either (no coupon support on that path).
  @Column({ name: 'coupon_code', type: 'varchar', nullable: true })
  couponCode: string | null;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 10, scale: 2, nullable: true })
  discountAmount: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];
}
