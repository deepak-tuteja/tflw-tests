import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum NotificationType {
  ORDER_STATUS_CHANGED = 'order_status_changed',
  REVIEW_REPLY = 'review_reply',
  PRICE_DROP = 'price_drop',
}

// Polymorphic by `type` (M13, plan_v2.md Part F): `payload`'s shape depends on it —
// { orderId, oldStatus, newStatus } | { reviewId, replyText } | { productId, oldPrice, newPrice }.
// Stored generically as jsonb (no per-type columns/tables) since these are pure read-side
// records with no relational queries of their own; the polymorphism only needs to be visible in
// the API response, which NotificationsService flattens `payload` into (see toResponse).
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
