import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../entities/order.entity';
import { AuthModule } from '../auth/auth.module';
import { VulnController } from './vuln.controller';
import { VulnOrdersController } from './vuln-orders.controller';
import { VulnInputController } from './vuln-input.controller';
import { VulnReportsController } from './vuln-reports.controller';

// Gated by `VULN_MODE=1` at the point of import (`app.module.ts`), not by a guard inside the
// controller. The difference is what "off" means: the routes are genuinely absent from the running
// app — `404`, no handler, nothing in the router table — rather than present and declining to
// answer. A guarded route is still a route, and this suite's default `docker compose up` is the
// stack ~45 other files run against.
//
// `VULN_MODE=1 node cli.mjs start` (or `VULN_MODE=1 docker compose up`) turns it on;
// `docker-compose.yml` passes the variable through and defaults it to empty.
//
// FOUR CONTROLLERS, ONE MODULE, and the split is along what each one needs rather than along what
// each one is for. `VulnController` (Tier 1) is headers and cookie flags: no database, no guards,
// no dependencies at all. `VulnOrdersController` (Tier 2, testFlow PLAN_M130_PENTEST_TIER2.md
// D317) plants broken *authorization*, which means it has to authenticate before it can fail to
// authorize, and it has to return real rows or there is nothing whose ownership could be wrong.
// `VulnInputController` (Tier 3, testFlow PLAN_M134_PENTEST_TIER3.md D379) plants broken *input
// handling*, and needs a third set of things again — a raw query, a filesystem read and a markup
// response. Folding any of them together would give one slice dependencies it has no use for;
// `M128a`'s slice ran with no imports at all and should keep running that way.
//
// `VulnReportsController` (Tier 4, testFlow PLAN_M137_PENTEST_TIER4.md D437/D438) is the exception
// to that sentence, and the exception is instructive: it needs **nothing** the Tier 2 controller
// does not already have — the same repository, the same guard, the same unscoped `find`. It is a
// separate controller because `@ApiExcludeController()` is a **class** decorator, so the one thing
// that distinguishes this plant — that a crawler reading `/openapi.json` can find it — cannot be
// expressed per-route on a controller that carries the exclusion. The split here is along
// *visibility*, not along dependencies, and that is why it is worth a paragraph rather than a line.
//
// `AuthModule` is imported for `AnyAuthGuard` alone (the same reason `OrdersModule` imports it),
// and `Order` is the only entity registered — Tier 2 reads and deletes orders, Tier 3 borrows its
// repository only as a way to reach `query()`, Tier 4 reads them unscoped, and nothing else is
// touched.
@Module({
  imports: [TypeOrmModule.forFeature([Order]), AuthModule],
  controllers: [VulnController, VulnOrdersController, VulnInputController, VulnReportsController],
})
export class VulnModule {}

// Read once here so the answer is a single fact with one name, rather than a string comparison
// repeated at each site that has to agree with the others.
export const VULN_MODE_ENABLED = process.env.VULN_MODE === '1';
