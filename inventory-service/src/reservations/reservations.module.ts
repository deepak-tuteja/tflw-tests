import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StockLevel } from "../entities/stock-level.entity";
import { ReservationsController } from "./reservations.controller";
import { ReservationsService } from "./reservations.service";
import { BackordersModule } from "../backorders/backorders.module";

@Module({
  imports: [TypeOrmModule.forFeature([StockLevel]), BackordersModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
