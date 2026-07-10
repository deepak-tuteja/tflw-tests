import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from '../entities/review.entity';
import { ReviewsController } from './reviews.controller';
import { ReviewRepliesController } from './review-replies.controller';
import { ReviewsService } from './reviews.service';
import { ProductsModule } from '../products/products.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Review]), ProductsModule, AuthModule, NotificationsModule],
  controllers: [ReviewsController, ReviewRepliesController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
