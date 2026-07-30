import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoadAdminController } from './load-admin.controller';
import { LoadAdminService } from './load-admin.service';
import { Product } from '../entities/product.entity';
import { Order } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Order, User]), AuthModule],
  controllers: [LoadAdminController],
  providers: [LoadAdminService],
})
export class LoadAdminModule {}
