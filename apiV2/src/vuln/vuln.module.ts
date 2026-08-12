import { Module } from '@nestjs/common';
import { VulnController } from './vuln.controller';

// Gated by `VULN_MODE=1` at the point of import (`app.module.ts`), not by a guard inside the
// controller. The difference is what "off" means: the routes are genuinely absent from the running
// app — `404`, no handler, nothing in the router table — rather than present and declining to
// answer. A guarded route is still a route, and this suite's default `docker compose up` is the
// stack ~45 other files run against.
//
// `VULN_MODE=1 node cli.mjs start` (or `VULN_MODE=1 docker compose up`) turns it on;
// `docker-compose.yml` passes the variable through and defaults it to empty.
@Module({
  controllers: [VulnController],
})
export class VulnModule {}

// Read once here so the answer is a single fact with one name, rather than a string comparison
// repeated at each site that has to agree with the others.
export const VULN_MODE_ENABLED = process.env.VULN_MODE === '1';
