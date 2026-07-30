import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum BackorderStatus {
  OPEN = "open",
  FULFILLED = "fulfilled",
  CANCELLED = "cancelled",
}

// PLAN_ENTERPRISE_REGRESSION.md E4 — the first-class outcome of a reservation that couldn't be
// fully satisfied from on-hand stock across every warehouse (ReservationsService), rather than a
// bare checkout error. `orderId` is apiV2's own Order primary key (a bare uuid string, same
// cross-service-reference convention as StockLevel.productId) so a human can trace this back to
// the order that triggered it; this service never calls back into apiV2 to validate it.
@Entity("backorder_requests")
export class BackorderRequest {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "product_id" })
  productId: string;

  @Column({ name: "order_id", type: "uuid", nullable: true })
  orderId: string | null;

  @Column({ type: "int" })
  quantity: number;

  @Column({
    type: "enum",
    enum: BackorderStatus,
    default: BackorderStatus.OPEN,
  })
  status: BackorderStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
