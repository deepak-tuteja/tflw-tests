import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../entities/review.entity';
import { ReviewReply } from '../entities/review-reply.entity';
import { CreateReviewReplyDto } from './dto/create-review-reply.dto';

export interface ReviewReplyNode {
  id: string;
  authorUserId: string;
  text: string;
  createdAt: Date;
  children: ReviewReplyNode[];
}

// Threaded Q&A under a review (M31, plan_v2.md Part R Cluster D) — a real self-referencing
// resource distinct from `Review.replyText`'s single admin reply (M13). Kept as its own
// single-purpose module (same pattern as `retry-demo`/`contract-demo`) rather than folded into
// `ReviewsService`, since it owns a different entity/repository entirely.
@Injectable()
export class ReviewThreadService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(ReviewReply)
    private readonly replies: Repository<ReviewReply>,
  ) {}

  async create(
    reviewId: string,
    authorUserId: string,
    dto: CreateReviewReplyDto,
  ): Promise<ReviewReply> {
    const review = await this.reviews.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('review not found');

    if (dto.parentReplyId) {
      const parent = await this.replies.findOne({
        where: { id: dto.parentReplyId },
      });
      // A UUID alone can't express "and belongs to this review" — a parentReplyId from a
      // *different* review's thread is rejected the same way a missing one is, rather than
      // silently grafting one review's thread onto another's.
      if (!parent || parent.reviewId !== reviewId) {
        throw new BadRequestException(
          'parentReplyId does not belong to this review',
        );
      }
    }

    const reply = this.replies.create({
      reviewId,
      authorUserId,
      text: dto.text,
      parentReplyId: dto.parentReplyId ?? null,
    });
    return this.replies.save(reply);
  }

  // Assembled in memory from one flat query, same precedent as `CategoriesService.findTree` —
  // a review's own reply count is small enough that this beats a recursive CTE for real, without
  // adding real cost. Unlike the category tree (a fixed, admin-edited business taxonomy that
  // rarely goes beyond 2-3 levels), a reply thread is genuine user-generated content with no
  // depth ceiling — the point of this milestone.
  async findThread(reviewId: string): Promise<ReviewReplyNode[]> {
    const review = await this.reviews.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('review not found');

    const all = await this.replies.find({
      where: { reviewId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const nodes = new Map<string, ReviewReplyNode>();
    for (const r of all) {
      nodes.set(r.id, {
        id: r.id,
        authorUserId: r.authorUserId,
        text: r.text,
        createdAt: r.createdAt,
        children: [],
      });
    }

    const roots: ReviewReplyNode[] = [];
    for (const r of all) {
      const node = nodes.get(r.id)!;
      const parent = r.parentReplyId ? nodes.get(r.parentReplyId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }
}
