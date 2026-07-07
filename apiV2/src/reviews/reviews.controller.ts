import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function clampLimit(raw: string | undefined): number {
  const n = raw ? parseInt(raw, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

// Nested under its parent product (plan_v2.md Cluster 4). Reads are public (browsing reviews
// needs no auth, same as the catalog); creating one needs auth and is the rate-limited hot path.
@ApiTags('reviews')
@Controller('products/:productId/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  async list(
    @Param('productId') productId: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limitRaw: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const limit = clampLimit(limitRaw);
    const { data, nextCursor } = await this.reviews.findPageForProduct(productId, cursor, limit);

    if (nextCursor) {
      const qs = new URLSearchParams({ cursor: nextCursor, limit: String(limit) }).toString();
      res.setHeader('Link', `<${req.path}?${qs}>; rel="next"`);
    }

    return { data, nextCursor };
  }

  @Post()
  @UseGuards(AnyAuthGuard, RateLimitGuard)
  create(
    @Param('productId') productId: string,
    @CurrentUser() user: AuthedUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(productId, user.id, dto);
  }
}
