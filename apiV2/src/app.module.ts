import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { OauthModule } from './oauth/oauth.module';
import { ProfileExportModule } from './profile-export/profile-export.module';
import { ProductsModule } from './products/products.module';
import { UsersModule } from './users/users.module';
import { OrdersModule } from './orders/orders.module';
import { CategoriesModule } from './categories/categories.module';
import { User } from './entities/user.entity';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Review } from './entities/review.entity';
import { ReviewReply } from './entities/review-reply.entity';
import { TokenRecord } from './entities/token-record.entity';
import { Job } from './entities/job.entity';
import { Notification } from './entities/notification.entity';
import { Coupon } from './entities/coupon.entity';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { ReturnRequest } from './entities/return-request.entity';
import { Ticket } from './entities/ticket.entity';
import { TicketComment } from './entities/ticket-comment.entity';
import { TicketEvent } from './entities/ticket-event.entity';
import { Upload } from './entities/upload.entity';
import { Organization } from './entities/organization.entity';
import { OrgMembership } from './entities/org-membership.entity';
import { JobsModule } from './jobs/jobs.module';
import { ReviewsModule } from './reviews/reviews.module';
import { FlakyWidgetModule } from './flaky-widget/flaky-widget.module';
import { RetryDemoModule } from './retry-demo/retry-demo.module';
import { SafetyDemoModule } from './safety-demo/safety-demo.module';
import { ContractDemoModule } from './contract-demo/contract-demo.module';
import { SoftCheckModule } from './soft-check/soft-check.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CouponsModule } from './coupons/coupons.module';
import { CartModule } from './cart/cart.module';
import { ReturnRequestsModule } from './return-requests/return-requests.module';
import { TicketsModule } from './tickets/tickets.module';
import { UploadsModule } from './uploads/uploads.module';
import { OrgsModule } from './orgs/orgs.module';
import { LoadAdminModule } from './load-admin/load-admin.module';
import { VulnModule, VULN_MODE_ENABLED } from './vuln/vuln.module';

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
          ReviewReply,
          TokenRecord,
          Job,
          Notification,
          Coupon,
          Cart,
          CartItem,
          ReturnRequest,
          Ticket,
          TicketComment,
          TicketEvent,
          Upload,
          Organization,
          OrgMembership,
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
    UsersModule,
    OrdersModule,
    JobsModule,
    ReviewsModule,
    FlakyWidgetModule,
    RetryDemoModule,
    SafetyDemoModule,
    ContractDemoModule,
    // `M154b` / `C1` — the known-answer plant for tflw's `check` step. Unconditionally mounted
    // (`D725`); it serves a frozen constant, not a flaw.
    SoftCheckModule,
    NotificationsModule,
    CouponsModule,
    CartModule,
    ReturnRequestsModule,
    TicketsModule,
    UploadsModule,
    OrgsModule,
    LoadAdminModule,
    // The pentest-arc hygiene fixture slice, absent unless `VULN_MODE=1` (see vuln/vuln.module.ts).
    // Conditional at the imports array, so "off" means the routes do not exist rather than that
    // they refuse to answer.
    ...(VULN_MODE_ENABLED ? [VulnModule] : []),
  ],
})
export class AppModule {}
