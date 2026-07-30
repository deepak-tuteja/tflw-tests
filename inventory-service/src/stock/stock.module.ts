import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StockLevel } from "../entities/stock-level.entity";
import { RestockEvent } from "../entities/restock-event.entity";
import { Warehouse } from "../entities/warehouse.entity";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";

@Module({
  imports: [TypeOrmModule.forFeature([StockLevel, RestockEvent, Warehouse])],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
