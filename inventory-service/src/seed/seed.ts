import "reflect-metadata";
import AppDataSource from "../data-source";
import { Warehouse } from "../entities/warehouse.entity";
import { StockLevel } from "../entities/stock-level.entity";
import { RestockEvent } from "../entities/restock-event.entity";

// This service tracks stock for apiV2's own products — a different Postgres instance entirely
// (decision 1) — so it has no product rows of its own to seed. Instead it looks the real seeded
// products up by name from apiV2's already-public, unauthenticated catalog read (`GET /products`,
// no page/pageSize -> the bare-array shape) at container-start time. `docker-compose.yml`'s
// `depends_on: api: condition: service_healthy` guarantees apiV2 (and its own seed) is already up
// by the time this runs; the retry loop below is defense against a genuine race, not the primary
// ordering mechanism.
const API_BASE_URL = process.env.API_BASE_URL ?? "http://api:4001/v1";

interface SeedProduct {
  id: string;
  name: string;
}

async function fetchProductsByName(): Promise<Map<string, string>> {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const res = await fetch(`${API_BASE_URL}/products`);
      if (res.ok) {
        const products = (await res.json()) as SeedProduct[];
        return new Map(products.map((p) => [p.name, p.id]));
      }
    } catch {
      // apiV2 not reachable yet — fall through to retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    `could not fetch products from ${API_BASE_URL}/products after 10 attempts`,
  );
}

// Deterministic and idempotent (upsert-by-natural-key), same convention as apiV2's own seed —
// safe to run on every container start.
async function seed() {
  const ds = await AppDataSource.initialize();
  const warehouseRepo = ds.getRepository(Warehouse);
  const stockLevelRepo = ds.getRepository(StockLevel);
  const restockEventRepo = ds.getRepository(RestockEvent);

  const warehouseDefs = [
    { name: "North Distribution Center", location: "Columbus, OH" },
    { name: "South Distribution Center", location: "Austin, TX" },
  ];
  const warehouses = new Map<string, Warehouse>();
  for (const def of warehouseDefs) {
    let warehouse = await warehouseRepo.findOne({ where: { name: def.name } });
    if (!warehouse)
      warehouse = await warehouseRepo.save(warehouseRepo.create(def));
    warehouses.set(def.name, warehouse);
  }
  const north = warehouses.get("North Distribution Center")!;
  const south = warehouses.get("South Distribution Center")!;

  const productIdByName = await fetchProductsByName();

  // Two warehouses' worth of stock per named seed product (apiV2/src/seed/seed.ts). "French
  // Press" is deliberately left near-empty (1 unit total, both warehouses combined) so any
  // checkout ordering more than 1 unit exercises the backorder path for real, without needing a
  // test-only product just to trigger it.
  const stockDefs: Array<{
    productName: string;
    north: number;
    south: number;
  }> = [
    { productName: "Wireless Mouse", north: 50, south: 30 },
    { productName: "Mechanical Keyboard", north: 40, south: 25 },
    { productName: "The Pragmatic Programmer", north: 20, south: 15 },
    { productName: "Clean Code", north: 20, south: 10 },
    { productName: "French Press", north: 1, south: 0 },
  ];

  for (const def of stockDefs) {
    const productId = productIdByName.get(def.productName);
    if (!productId) {
      console.warn(
        `seed: product "${def.productName}" not found in apiV2's catalog, skipping`,
      );
      continue;
    }
    for (const [warehouse, quantity] of [
      [north, def.north],
      [south, def.south],
    ] as const) {
      let level = await stockLevelRepo.findOne({
        where: { productId, warehouseId: warehouse.id },
      });
      if (!level) {
        level = await stockLevelRepo.save(
          stockLevelRepo.create({
            productId,
            warehouseId: warehouse.id,
            quantity,
          }),
        );
        // One RestockEvent per initial stocking — a real, pre-existing audit-trail row, not just
        // a bare counter (tests/api/inventoryOps/'s restock-event listing has something to find).
        if (quantity > 0) {
          const existingEvent = await restockEventRepo.findOne({
            where: { productId, warehouseId: warehouse.id },
          });
          if (!existingEvent) {
            await restockEventRepo.save(
              restockEventRepo.create({
                productId,
                warehouseId: warehouse.id,
                quantity,
              }),
            );
          }
        }
      }
    }
  }

  await ds.destroy();
  console.log("inventory-service seed complete");
}

seed().catch((err) => {
  console.error("inventory-service seed failed:", err);
  process.exit(1);
});
