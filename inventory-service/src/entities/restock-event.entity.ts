import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Warehouse } from "./warehouse.entity";

// PLAN_ENTERPRISE_REGRESSION.md E4 — an immutable audit trail of every stock increase (manual
// restock, not a reservation/decrement — those mutate StockLevel.quantity directly and leave no
// row here). `RestockEventsService.create` is the only writer of StockLevel increases, mirroring
// this project's house style of a real, queryable side-effect record rather than a bare counter.
@Entity("restock_events")
export class RestockEvent {
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

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
