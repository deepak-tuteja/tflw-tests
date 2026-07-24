import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReviewThreadService } from './review-thread.service';
import { CreateReviewReplyDto } from './dto/create-review-reply.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';

// `/reviews/:id/replies` (plural, M31) — deliberately separate from the existing admin-only
// `/reviews/:id/reply` (singular, M13, `ReviewRepliesController`): that's the single official
// seller response, this is an open, arbitrary-depth Q&A thread any authenticated user can post
// or reply into. Reads are public, same as the review list itself.
@ApiTags('reviews')
@Controller('reviews')
export class ReviewThreadController {
  constructor(private readonly thread: ReviewThreadService) {}

  @Get(':id/replies')
  findThread(@Param('id', ParseUUIDPipe) id: string) {
    return this.thread.findThread(id);
  }

  @Post(':id/replies')
  @UseGuards(AnyAuthGuard)
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
    @Body() dto: CreateReviewReplyDto,
  ) {
    return this.thread.create(id, user.id, dto);
  }
}
