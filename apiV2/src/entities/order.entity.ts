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
  // PLAN_RETURNS.md R2 — terminal state reached once an approved return request's refund job
  // (JobsService.startRefund) completes. Never set synchronously; only the job continuation
  // writes it.
  REFUNDED = 'refunded',
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

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  discountAmount: string | null;

  // Outbound-webhook cluster (M33, plan_v2.md Part R Cluster C) — an optional delivery URL set at
  // order creation; fired once, best-effort, when fulfillment reaches its terminal FULFILLED
  // transition (JobsService.continueFulfillment). A real e-commerce integration point (order-
  // completion webhooks, same shape as Stripe/Shopify), not a fixture manufactured for its own
  // sake — and it reuses the fulfillment flow's already-real async-job mechanism rather than
  // inventing a second one.
  @Column({ name: 'webhook_url', type: 'varchar', nullable: true })
  webhookUrl: string | null;

  // PLAN_ENTERPRISE_REGRESSION.md E3 — denormalized from the placing user's org membership at
  // creation time (null if they have none). Lets an org owner/admin see every order placed by any
  // member of their org (OrdersService.findAllForOrg/findOneScoped), on top of the existing
  // per-user ownership scoping (findOwn stays user-scoped, unaffected).
  @Column({ name: 'org_id', type: 'uuid', nullable: true })
  orgId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];
}
