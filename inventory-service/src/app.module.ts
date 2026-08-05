import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HealthModule } from "./health/health.module";
import { Warehouse } from "./entities/warehouse.entity";
import { StockLevel } from "./entities/stock-level.entity";
import { BackorderRequest } from "./entities/backorder-request.entity";
import { RestockEvent } from "./entities/restock-event.entity";
import { WarehousesModule } from "./warehouses/warehouses.module";
import { StockModule } from "./stock/stock.module";
import { BackordersModule } from "./backorders/backorders.module";
import { ReservationsModule } from "./reservations/reservations.module";
import { OpsSessionModule } from "./ops-session/ops-session.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres" as const,
        host: config.get<string>("INV_DB_HOST", "localhost"),
        port: config.get<number>("INV_DB_PORT", 5433),
        username: config.get<string>("INV_DB_USER", "postgres"),
        password: config.get<string>("INV_DB_PASSWORD", "postgres"),
        database: config.get<string>("INV_DB_NAME", "inventory_service"),
        entities: [Warehouse, StockLevel, BackorderRequest, RestockEvent],
        // Same convention as apiV2's own AppModule: migrations run as a separate step
        // (docker-entrypoint.sh), the app never mutates schema on its own.
        synchronize: false,
      }),
    }),
    HealthModule,
    WarehousesModule,
    StockModule,
    BackordersModule,
    ReservationsModule,
    OpsSessionModule,
  ],
})
export class AppModule {}
