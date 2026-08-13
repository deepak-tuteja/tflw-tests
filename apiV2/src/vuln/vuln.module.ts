import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../entities/order.entity';
import { AuthModule } from '../auth/auth.module';
import { VulnController } from './vuln.controller';
import { VulnOrdersController } from './vuln-orders.controller';

// Gated by `VULN_MODE=1` at the point of import (`app.module.ts`), not by a guard inside the
// controller. The difference is what "off" means: the routes are genuinely absent from the running
// app — `404`, no handler, nothing in the router table — rather than present and declining to
// answer. A guarded route is still a route, and this suite's default `docker compose up` is the
// stack ~45 other files run against.
//
// `VULN_MODE=1 node cli.mjs start` (or `VULN_MODE=1 docker compose up`) turns it on;
// `docker-compose.yml` passes the variable through and defaults it to empty.
//
// TWO CONTROLLERS, ONE MODULE, and the split is along what each one needs rather than along what
// each one is for. `VulnController` (Tier 1) is headers and cookie flags: no database, no guards,
// no dependencies at all. `VulnOrdersController` (Tier 2, testFlow PLAN_M130_PENTEST_TIER2.md
// D317) plants broken *authorization*, which means it has to authenticate before it can fail to
// authorize, and it has to return real rows or there is nothing whose ownership could be wrong.
// Folding them into one file would give the header fixtures a Postgres dependency they have no use
// for; `M128a`'s slice ran with neither import and should keep running that way.
//
// `AuthModule` is imported for `AnyAuthGuard` alone (the same reason `OrdersModule` imports it),
// and `Order` is the only entity registered — the fixture reads and deletes orders and touches
// nothing else.
@Module({
  imports: [TypeOrmModule.forFeature([Order]), AuthModule],
  controllers: [VulnController, VulnOrdersController],
})
export class VulnModule {}

// Read once here so the answer is a single fact with one name, rather than a string comparison
// repeated at each site that has to agree with the others.
export const VULN_MODE_ENABLED = process.env.VULN_MODE === '1';
