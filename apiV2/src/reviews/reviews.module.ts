import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from '../entities/review.entity';
import { ReviewReply } from '../entities/review-reply.entity';
import { ReviewsController } from './reviews.controller';
import { ReviewRepliesController } from './review-replies.controller';
import { ReviewThreadController } from './review-thread.controller';
import { ReviewsService } from './reviews.service';
import { ReviewThreadService } from './review-thread.service';
import { ProductsModule } from '../products/products.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, ReviewReply]),
    ProductsModule,
    AuthModule,
    NotificationsModule,
  ],
  controllers: [
    ReviewsController,
    ReviewRepliesController,
    ReviewThreadController,
  ],
  providers: [ReviewsService, ReviewThreadService],
})
export class ReviewsModule {}
