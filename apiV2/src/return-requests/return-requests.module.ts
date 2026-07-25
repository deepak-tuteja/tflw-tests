import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../entities/order.entity';
import { ReturnRequest } from '../entities/return-request.entity';
import { OrderReturnRequestController } from './order-return-request.controller';
import { ReturnRequestsController } from './return-requests.controller';
import { ReturnRequestsService } from './return-requests.service';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, ReturnRequest]),
    AuthModule,
    JobsModule,
  ],
  controllers: [OrderReturnRequestController, ReturnRequestsController],
  providers: [ReturnRequestsService],
  exports: [ReturnRequestsService],
})
export class ReturnRequestsModule {}
