import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StockService } from "./stock.service";
import { CreateRestockEventDto } from "./dto/create-restock-event.dto";

@ApiTags("stock")
@Controller()
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get("stock-levels")
  findAllStockLevels(
    @Query("productId") productId?: string,
    @Query("warehouseId") warehouseId?: string,
  ) {
    return this.stock.findAllStockLevels(productId, warehouseId);
  }

  @Get("stock-levels/:id")
  findOneStockLevel(@Param("id", ParseUUIDPipe) id: string) {
    return this.stock.findOneStockLevel(id);
  }

  @Get("restock-events")
  findAllRestockEvents(@Query("productId") productId?: string) {
    return this.stock.findAllRestockEvents(productId);
  }

  @Post("restock-events")
  restock(@Body() dto: CreateRestockEventDto) {
    return this.stock.restock(dto);
  }
}
