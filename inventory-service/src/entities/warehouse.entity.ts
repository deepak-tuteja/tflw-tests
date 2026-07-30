import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

// PLAN_ENTERPRISE_REGRESSION.md E4 — a physical fulfillment location. Deliberately no relation
// back to apiV2's Product/Order (a different Postgres instance entirely, decision 1) — every
// cross-service reference here is a bare uuid string, resolved by whichever side needs the name.
@Entity("warehouses")
export class Warehouse {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column()
  location: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
