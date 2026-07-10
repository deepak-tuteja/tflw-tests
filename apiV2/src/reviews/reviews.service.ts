import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../entities/review.entity';
import { NotificationType } from '../entities/notification.entity';
import { ProductsService } from '../products/products.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReplyToReviewDto } from './dto/reply-to-review.dto';
import { isUniqueViolation } from '../common/db-errors';
import { decodeCursor, encodeCursor } from '../common/cursor';

export interface ReviewPage {
  data: Review[];
  nextCursor: string | null;
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    private readonly products: ProductsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(productId: string, userId: string, dto: CreateReviewDto): Promise<Review> {
    await this.products.findOne(productId); // 404s if the product doesn't exist

    const review = this.reviews.create({
      productId,
      userId,
      rating: dto.rating,
      comment: dto.comment ?? '',
    });
    try {
      return await this.reviews.save(review);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('you have already reviewed this product');
      }
      throw err;
    }
  }

  // Cursor (keyset) pagination — nested list endpoint (plan_v2.md Cluster 4). Ordered by
  // (created_at, id) so the tie-break is stable even when two reviews land in the same instant.
  async findPageForProduct(productId: string, cursor: string | undefined, limit: number): Promise<ReviewPage> {
    await this.products.findOne(productId);

    const qb = this.reviews
      .createQueryBuilder('review')
      .where('review.product_id = :productId', { productId });

    if (cursor) {
      const after = decodeCursor(cursor);
      // Postgres's `now()` (what populates created_at) has microsecond precision; the cursor was
      // encoded from a JS Date, which only has millisecond precision. Comparing the raw column
      // against the truncated cursor value would make the boundary row's own `created_at >
      // :createdAt` true (its sub-millisecond remainder), leaking it onto the next page too —
      // truncating the column to milliseconds on both sides of the comparison keeps it exact.
      qb.andWhere(
        "(date_trunc('milliseconds', review.created_at) > :createdAt::timestamp) OR " +
          "(date_trunc('milliseconds', review.created_at) = :createdAt::timestamp AND review.id > :id)",
        { createdAt: after.createdAt, id: after.id },
      );
    }

    qb.orderBy('review.created_at', 'ASC').addOrderBy('review.id', 'ASC').take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last
      ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      : null;

    return { data, nextCursor };
  }

  // Admin/seller reply (M13, plan_v2.md Part F) — flat `/reviews/:id/reply`, not nested under a
  // product, since a review's id is already globally unique and the reply targets the review
  // itself, not its product context. Fires a real `review_reply` notification for the review's
  // author, the same side-effect-only pattern as order-status changes and price drops.
  async reply(id: string, dto: ReplyToReviewDto): Promise<Review> {
    const review = await this.reviews.findOne({ where: { id } });
    if (!review) throw new NotFoundException('review not found');

    review.replyText = dto.replyText;
    const saved = await this.reviews.save(review);

    await this.notifications.create(review.userId, NotificationType.REVIEW_REPLY, {
      reviewId: review.id,
      replyText: dto.replyText,
    });

    return saved;
  }
}
