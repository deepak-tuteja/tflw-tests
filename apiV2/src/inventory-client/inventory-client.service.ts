import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ReservationItemInput {
  productId: string;
  quantity: number;
}

export interface ReservationItemResult {
  productId: string;
  requestedQuantity: number;
  reservedQuantity: number;
  backorderId: string | null;
}

export interface ReservationResult {
  orderId: string | null;
  fullyReserved: boolean;
  items: ReservationItemResult[];
}

// PLAN_ENTERPRISE_REGRESSION.md E4 — apiV2's side of the checkout cross-service call. A genuine
// HTTP call over the docker network (not `stub`bed — decision 4, this project's own house style
// reserves `stub` for genuinely third-party dependencies), made *after* the order's own DB
// transaction has already committed: a reservation shortfall is a second, independent system
// discovering it separately, never a reason to roll back an order that apiV2's own Product.stock
// check (M15, unchanged by this milestone) already approved.
@Injectable()
export class InventoryClientService {
  private readonly logger = new Logger('InventoryClientService');
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>(
      'INVENTORY_SERVICE_URL',
      'http://inventory-service:4002/v1',
    );
  }

  // Never throws: an order has already been created and committed by the time this runs, so a
  // reservation-call failure (network blip, inventory-service momentarily down) must not surface
  // as a checkout error — it's logged and treated as "nothing reserved, nothing backordered"
  // rather than blocking or rolling back an already-successful purchase.
  async reserve(
    orderId: string,
    items: ReservationItemInput[],
  ): Promise<ReservationResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, items }),
      });
      if (!res.ok) {
        this.logger.warn(
          `reservation request for order ${orderId} failed with status ${res.status}`,
        );
        return null;
      }
      return (await res.json()) as ReservationResult;
    } catch (err) {
      this.logger.warn(
        `reservation request for order ${orderId} errored: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
