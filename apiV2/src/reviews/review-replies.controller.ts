import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { ReplyToReviewDto } from './dto/reply-to-review.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../entities/user.entity';

// Flat `/reviews/:id/reply` (M13) — deliberately a separate controller from ReviewsController
// (mounted at `products/:productId/reviews`) since a reply targets a review by its own globally
// unique id, not scoped through a product path.
@ApiTags('reviews')
@Controller('reviews')
export class ReviewRepliesController {
  constructor(private readonly reviews: ReviewsService) {}

  // 200, not the POST default 201 — a reply mutates an existing review, it doesn't create a new
  // resource (same convention as this API's session-login/session-refresh endpoints).
  @Post(':id/reply')
  @HttpCode(200)
  @UseGuards(AnyAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  reply(@Param('id') id: string, @Body() dto: ReplyToReviewDto) {
    return this.reviews.reply(id, dto);
  }
}
