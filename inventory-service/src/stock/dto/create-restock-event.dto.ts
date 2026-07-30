import { IsInt, IsUUID, Min } from "class-validator";

// Also the upsert path for a StockLevel row that doesn't exist yet (StockService.restock) — a
// genuinely new product/warehouse pairing starts at 0 and this event brings it up, rather than
// requiring a separate "create a stock level" step first.
export class CreateRestockEventDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  warehouseId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
