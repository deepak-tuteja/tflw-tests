import { MigrationInterface, QueryRunner } from "typeorm";

// PLAN_ENTERPRISE_REGRESSION.md E4 — inventory-service's own schema, own Postgres instance
// (decision 1: a real second system, not a schema on apiV2's DB). `uuid_generate_v4()` needs the
// same `uuid-ossp` extension apiV2's own first migration enables — this is a fresh database, so
// it's enabled here too rather than assumed present.
export class InitInventorySchema1785200000000 implements MigrationInterface {
  name = "InitInventorySchema1785200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
            CREATE TABLE "warehouses" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "location" character varying NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_warehouses_id" PRIMARY KEY ("id")
            )
        `);

    await queryRunner.query(`
            CREATE TABLE "stock_levels" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "product_id" uuid NOT NULL,
                "warehouse_id" uuid NOT NULL,
                "quantity" integer NOT NULL,
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_stock_levels_product_warehouse" UNIQUE ("product_id", "warehouse_id"),
                CONSTRAINT "PK_stock_levels_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "stock_levels"
            ADD CONSTRAINT "FK_stock_levels_warehouse_id" FOREIGN KEY ("warehouse_id")
            REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

    await queryRunner.query(
      `CREATE TYPE "public"."backorder_requests_status_enum" AS ENUM('open', 'fulfilled', 'cancelled')`,
    );
    await queryRunner.query(`
            CREATE TABLE "backorder_requests" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "product_id" uuid NOT NULL,
                "order_id" uuid,
                "quantity" integer NOT NULL,
                "status" "public"."backorder_requests_status_enum" NOT NULL DEFAULT 'open',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_backorder_requests_id" PRIMARY KEY ("id")
            )
        `);

    await queryRunner.query(`
            CREATE TABLE "restock_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "product_id" uuid NOT NULL,
                "warehouse_id" uuid NOT NULL,
                "quantity" integer NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_restock_events_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "restock_events"
            ADD CONSTRAINT "FK_restock_events_warehouse_id" FOREIGN KEY ("warehouse_id")
            REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "restock_events" DROP CONSTRAINT "FK_restock_events_warehouse_id"`,
    );
    await queryRunner.query(`DROP TABLE "restock_events"`);
    await queryRunner.query(`DROP TABLE "backorder_requests"`);
    await queryRunner.query(
      `DROP TYPE "public"."backorder_requests_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_levels" DROP CONSTRAINT "FK_stock_levels_warehouse_id"`,
    );
    await queryRunner.query(`DROP TABLE "stock_levels"`);
    await queryRunner.query(`DROP TABLE "warehouses"`);
  }
}
