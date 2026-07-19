import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { OauthModule } from './oauth/oauth.module';
import { ProfileExportModule } from './profile-export/profile-export.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { CategoriesModule } from './categories/categories.module';
import { User } from './entities/user.entity';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Review } from './entities/review.entity';
import { TokenRecord } from './entities/token-record.entity';
import { Job } from './entities/job.entity';
import { Notification } from './entities/notification.entity';
import { Coupon } from './entities/coupon.entity';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { JobsModule } from './jobs/jobs.module';
import { ReviewsModule } from './reviews/reviews.module';
import { FlakyWidgetModule } from './flaky-widget/flaky-widget.module';
import { RetryDemoModule } from './retry-demo/retry-demo.module';
import { ContractDemoModule } from './contract-demo/contract-demo.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CouponsModule } from './coupons/coupons.module';
import { CartModule } from './cart/cart.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_NAME', 'testflow_tests'),
        entities: [
          User,
          Category,
          Product,
          Order,
          OrderItem,
          Review,
          TokenRecord,
          Job,
          Notification,
          Coupon,
          Cart,
          CartItem,
        ],
        // Migrations run as a separate step (cli.mjs's start sequence);
        // the app never mutates schema on its own.
        synchronize: false,
      }),
    }),
    HealthModule,
    AuthModule,
    OauthModule,
    ProfileExportModule,
    CategoriesModule,
    ProductsModule,
    OrdersModule,
    JobsModule,
    ReviewsModule,
    FlakyWidgetModule,
    RetryDemoModule,
    ContractDemoModule,
    NotificationsModule,
    CouponsModule,
    CartModule,
  ],
})
export class AppModule {}
