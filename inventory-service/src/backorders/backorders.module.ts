import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BackorderRequest } from "../entities/backorder-request.entity";
import { BackordersController } from "./backorders.controller";
import { BackordersService } from "./backorders.service";

@Module({
  imports: [TypeOrmModule.forFeature([BackorderRequest])],
  controllers: [BackordersController],
  providers: [BackordersService],
  exports: [BackordersService],
})
export class BackordersModule {}
