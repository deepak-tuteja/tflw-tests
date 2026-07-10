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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
