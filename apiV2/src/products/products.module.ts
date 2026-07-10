import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Review } from '../entities/review.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CategoriesModule } from '../categories/categories.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, OrderItem, Review]),
    CategoriesModule,
    AuthModule,
    NotificationsModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
