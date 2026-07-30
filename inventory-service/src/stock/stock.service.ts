import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { StockLevel } from "../entities/stock-level.entity";
import { RestockEvent } from "../entities/restock-event.entity";
import { Warehouse } from "../entities/warehouse.entity";
import { CreateRestockEventDto } from "./dto/create-restock-event.dto";
import { isUniqueViolation } from "../common/db-errors";

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(StockLevel)
    private readonly stockLevels: Repository<StockLevel>,
    @InjectRepository(RestockEvent)
    private readonly restockEvents: Repository<RestockEvent>,
    @InjectRepository(Warehouse)
    private readonly warehouses: Repository<Warehouse>,
  ) {}

  findAllStockLevels(
    productId?: string,
    warehouseId?: string,
  ): Promise<StockLevel[]> {
    return this.stockLevels.find({
      where: {
        ...(productId ? { productId } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
      order: { updatedAt: "DESC" },
    });
  }

  async findOneStockLevel(id: string): Promise<StockLevel> {
    const level = await this.stockLevels.findOne({ where: { id } });
    if (!level) throw new NotFoundException("stock level not found");
    return level;
  }

  findAllRestockEvents(productId?: string): Promise<RestockEvent[]> {
    return this.restockEvents.find({
      where: productId ? { productId } : {},
      order: { createdAt: "DESC" },
    });
  }

  // A restock event both records the audit trail (RestockEvent, immutable) and increases the
  // live StockLevel.quantity it refers to — upserting that row if this is the first stock this
  // product has ever had in this warehouse (M15-style "no separate creation step," same
  // convention apiV2's own CartService.getOrCreateCart already uses).
  async restock(dto: CreateRestockEventDto): Promise<RestockEvent> {
    const warehouse = await this.warehouses.findOne({
      where: { id: dto.warehouseId },
    });
    if (!warehouse)
      throw new NotFoundException(`warehouse ${dto.warehouseId} not found`);

    await this.stockLevels
      .createQueryBuilder()
      .update(StockLevel)
      .set({ quantity: () => "quantity + :qty" })
      .where("product_id = :productId", { productId: dto.productId })
      .andWhere("warehouse_id = :warehouseId", { warehouseId: dto.warehouseId })
      .setParameter("qty", dto.quantity)
      .execute()
      .then(async (result) => {
        if (result.affected === 0) {
          try {
            await this.stockLevels.save(
              this.stockLevels.create({
                productId: dto.productId,
                warehouseId: dto.warehouseId,
                quantity: dto.quantity,
              }),
            );
          } catch (err) {
            // Lost a race to create this pairing's first row concurrently — the winner's row
            // already exists, so just add this event's quantity onto it instead.
            if (isUniqueViolation(err)) {
              await this.stockLevels
                .createQueryBuilder()
                .update(StockLevel)
                .set({ quantity: () => "quantity + :qty" })
                .where("product_id = :productId", { productId: dto.productId })
                .andWhere("warehouse_id = :warehouseId", {
                  warehouseId: dto.warehouseId,
                })
                .setParameter("qty", dto.quantity)
                .execute();
            } else {
              throw err;
            }
          }
        }
      });

    return this.restockEvents.save(
      this.restockEvents.create({
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantity,
      }),
    );
  }
}
