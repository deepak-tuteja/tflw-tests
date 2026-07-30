import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { StockLevel } from "../entities/stock-level.entity";
import { BackordersService } from "../backorders/backorders.service";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { ReservationItemResult, ReservationResult } from "./reservation-result";

// PLAN_ENTERPRISE_REGRESSION.md E4 — the actual cross-service checkout integration point: apiV2's
// OrdersService calls this over real HTTP after an order commits (InventoryClientService), one
// reservation request per order. Deliberately independent of apiV2's own Product.stock (M15) —
// that field stays the storefront-facing "can this be sold at all" gate, unchanged by this
// milestone (decision: E4 is purely additive); this is the *warehouse-fulfillment* system
// discovering it separately, which is exactly the realistic cross-service-consistency scenario
// this initiative exists to give tflw. A shortfall here doesn't fail the order or throw — it's a
// first-class BackorderRequest, reported back in the response for apiV2 to notify the customer.
@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(StockLevel)
    private readonly stockLevels: Repository<StockLevel>,
    private readonly backorders: BackordersService,
  ) {}

  async reserve(dto: CreateReservationDto): Promise<ReservationResult> {
    const orderId = dto.orderId ?? null;
    const items: ReservationItemResult[] = [];

    for (const item of dto.items) {
      const reserved = await this.reserveOneProduct(
        item.productId,
        item.quantity,
      );
      let backorderId: string | null = null;
      const shortfall = item.quantity - reserved;
      if (shortfall > 0) {
        const backorder = await this.backorders.create(
          item.productId,
          orderId,
          shortfall,
        );
        backorderId = backorder.id;
      }
      items.push({
        productId: item.productId,
        requestedQuantity: item.quantity,
        reservedQuantity: reserved,
        backorderId,
      });
    }

    return {
      orderId,
      fullyReserved: items.every((i) => i.backorderId === null),
      items,
    };
  }

  // Race-safe by construction, same conditional-UPDATE pattern as apiV2's own M15 stock
  // enforcement (`... WHERE quantity >= :take`): greedily drains the largest warehouse pools
  // first (deterministic, biggest-first tie-break by quantity then id), one atomic decrement per
  // warehouse row. If a concurrent reservation already drained a row between our read and our
  // update, that row's `affected === 0` and we simply move on to the next warehouse rather than
  // retrying against a stale read — an acceptable simplification for this dogfood fixture (not
  // the load-bearing correctness point the way single-row stock decrement is for apiV2 itself).
  private async reserveOneProduct(
    productId: string,
    quantity: number,
  ): Promise<number> {
    const levels = await this.stockLevels.find({
      where: { productId },
      order: { quantity: "DESC", id: "ASC" },
    });

    // A product with *no* StockLevel row anywhere isn't a zero-stock product — it's one this
    // warehouse system has never been told to track at all (every apiV2 product created outside
    // this milestone's own seed/restock calls is in this state). Treating "untracked" the same as
    // "confirmed zero stock" would backorder every single order in the entire suite, not just the
    // ones this milestone's own tests deliberately under-stock — caught for real by a pre-existing
    // adminOps notification-count test that broke the instant this integration went live.
    if (levels.length === 0) return quantity;

    let remaining = quantity;
    for (const level of levels) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, level.quantity);
      if (take <= 0) continue;

      const result = await this.stockLevels
        .createQueryBuilder()
        .update(StockLevel)
        .set({ quantity: () => "quantity - :take" })
        .where("id = :id", { id: level.id })
        .andWhere("quantity >= :take", { take })
        .setParameter("take", take)
        .execute();

      if (result.affected && result.affected > 0) {
        remaining -= take;
      }
    }

    return quantity - remaining;
  }
}
