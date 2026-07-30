import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum CouponType {
  PERCENT = 'percent',
  FIXED = 'fixed',
}

// M15 (plan_v2.md Part H decision 4): one coupon per checkout, no stacking. `usedCount` is
// incremented atomically alongside the stock decrement at checkout time (OrdersService.create)
// via a conditional `UPDATE ... WHERE used_count < usage_limit`, the same race-safety pattern as
// the stock decrement itself — a coupon's usage limit can't be oversold under concurrency any
// more than a product's stock can.
@Entity('coupons')
@Unique(['code'])
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column({ type: 'enum', enum: CouponType })
  type: CouponType;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  value: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({
    name: 'min_order_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  minOrderAmount: string;

  @Column({ name: 'usage_limit', type: 'int' })
  usageLimit: number;

  @Column({ name: 'used_count', type: 'int', default: 0 })
  usedCount: number;

  // PLAN_ENTERPRISE_REGRESSION.md E3 — null (the pre-E3 default) means a global coupon, redeemable
  // by anyone, exactly as today; non-null scopes redemption to members of that one org
  // (OrdersService.applyCoupon) and restricts who may create/list it (CouponsService) to a system
  // ADMIN or that org's own owner/admin.
  @Column({ name: 'org_id', type: 'uuid', nullable: true })
  orgId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
