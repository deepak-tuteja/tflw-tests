import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Review } from './review.entity';
import { User } from './user.entity';

// Threaded Q&A under a review (M31, plan_v2.md Part R Cluster D) — deliberately distinct from
// `Review.replyText` (the single official admin/seller response, M13): this is genuine
// user-generated, arbitrary-depth discussion, so it needs its own self-referencing entity rather
// than reusing the flat single-reply column. Self-ref `parentReplyId` is nullable (top-level reply
// on the review itself) and `CASCADE`s both ways: deleting the review deletes its whole thread,
// and (if a future delete-reply endpoint is added) deleting a reply deletes its descendants too —
// the realistic behavior for a comment thread, unlike `Category`'s promote-orphans-to-top-level.
@Entity('review_replies')
export class ReviewReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Review, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'review_id' })
  review: Review;

  @Column({ name: 'review_id' })
  reviewId: string;

  @Column({ name: 'parent_reply_id', type: 'uuid', nullable: true })
  parentReplyId: string | null;

  @ManyToOne(() => ReviewReply, (reply) => reply.children, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parent_reply_id' })
  parent: ReviewReply | null;

  @OneToMany(() => ReviewReply, (reply) => reply.parent)
  children: ReviewReply[];

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'author_user_id' })
  author: User;

  @Column({ name: 'author_user_id' })
  authorUserId: string;

  @Column({ type: 'text' })
  text: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
