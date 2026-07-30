import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Warehouse } from "./warehouse.entity";

// PLAN_ENTERPRISE_REGRESSION.md E4 — product x warehouse. `productId` is a bare uuid string
// (apiV2's own Product primary key, a different Postgres instance — decision 1), never a
// TypeORM relation across services. One row per (productId, warehouseId) pair; `quantity` is the
// single source of truth for "how much of this product sits in this warehouse right now,"
// decremented by ReservationsService the same race-safe conditional-UPDATE way apiV2's own
// Product.stock already is (M15's `stock >= :qty` pattern, mirrored here for a second time).
@Entity("stock_levels")
@Index(["productId", "warehouseId"], { unique: true })
export class StockLevel {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "product_id" })
  productId: string;

  @ManyToOne(() => Warehouse, { onDelete: "CASCADE", nullable: false })
  @JoinColumn({ name: "warehouse_id" })
  warehouse: Warehouse;

  @Column({ name: "warehouse_id" })
  warehouseId: string;

  @Column({ type: "int" })
  quantity: number;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
