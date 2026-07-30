import "reflect-metadata";
import { DataSource } from "typeorm";
import { Warehouse } from "./entities/warehouse.entity";
import { StockLevel } from "./entities/stock-level.entity";
import { BackorderRequest } from "./entities/backorder-request.entity";
import { RestockEvent } from "./entities/restock-event.entity";

// Used by both the TypeORM CLI (migration:generate/run) and NestJS's TypeOrmModule.forRootAsync
// at bootstrap, same convention as apiV2's own data-source.ts — own env vars (INV_DB_*, not
// DB_*), own container (decision 1: a real second Postgres, not a schema on the existing one).
const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.INV_DB_HOST ?? "localhost",
  port: Number(process.env.INV_DB_PORT ?? 5433),
  username: process.env.INV_DB_USER ?? "postgres",
  password: process.env.INV_DB_PASSWORD ?? "postgres",
  database: process.env.INV_DB_NAME ?? "inventory_service",
  entities: [Warehouse, StockLevel, BackorderRequest, RestockEvent],
  migrations: [__dirname + "/migrations/*.{js,ts}"],
  synchronize: false,
});

export default AppDataSource;
