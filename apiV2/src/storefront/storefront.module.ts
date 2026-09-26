import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { AvatarController } from './avatar.controller';
import { TrackingController } from './tracking.controller';

// `S-3a` (decision 16): the routes the storefront's new surfaces need a response from. Everything
// else those surfaces do — the iframe, the wishlist, the menus, the new tab — is the page's own.
@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [AvatarController, TrackingController],
})
export class StorefrontModule {}
