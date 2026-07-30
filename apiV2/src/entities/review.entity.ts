import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Product } from './product.entity';

@Entity('reviews')
@Unique(['userId', 'productId'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.reviews, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Product, (product) => product.reviews, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text', default: '' })
  comment: string;

  // Admin/seller reply (M13, plan_v2.md Part F) — nullable, single reply per review (no thread).
  @Column({ name: 'reply_text', type: 'text', nullable: true })
  replyText: string | null;

  // PLAN_ENTERPRISE_REGRESSION.md E3 — denormalized from the author's org membership at creation
  // time (null if they have none), for provenance/consistency with the other 3 retrofitted
  // entities. Deliberately NOT enforced on any read path: `GET /products/:id/reviews` is
  // intentionally public (reviews.controller.ts's own comment, unchanged since plan_v2.md Cluster
  // 4) — scoping the public storefront's review list by the viewer's org would break browsing for
  // every anonymous shopper and every shopper not in the reviewer's org, which is not what
  // "enterprise-complexity retrofit" is asking for. No org-facing review-moderation surface exists
  // to scope either (moderation is a system-admin/agent capability, unrelated to customer-org
  // membership — see webV2/admin's own README note on there being no cross-product review inbox).
  @Column({ name: 'org_id', type: 'uuid', nullable: true })
  orgId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
