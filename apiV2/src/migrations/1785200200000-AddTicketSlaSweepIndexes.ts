import { MigrationInterface, QueryRunner } from 'typeorm';

// M48 (tflw PLAN_BROWSER_PERF_SECURITY.md §2.20) — found via the ticket-write load rung:
// TicketSlaSweepService.sweep() runs every 300ms against `tickets` filtered on
// (status, sla_breached, sla_deadline), and `LoadAdminService.reset()`'s cascade-delete filters
// `ticket_events` by ticket_id — neither had a supporting index (only each table's own PK), so
// both were full sequential scans. Harmless at low row counts; under the ticket-write rung's
// sustained write load, ticket_events dead-tuple bloat from repeated create/reset cycles (145k
// dead vs 154k live rows observed) made the sweep's per-tick scan cost climb run over run,
// degrading throughput ~2x across three otherwise-identical 20s runs — a real scalability gap,
// not a load-test artifact.
export class AddTicketSlaSweepIndexes1785200200000 implements MigrationInterface {
  name = 'AddTicketSlaSweepIndexes1785200200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_tickets_sla_sweep" ON "tickets" ("status", "sla_breached", "sla_deadline")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_events_ticket_id" ON "ticket_events" ("ticket_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_ticket_events_ticket_id"`);
    await queryRunner.query(`DROP INDEX "IDX_tickets_sla_sweep"`);
  }
}
