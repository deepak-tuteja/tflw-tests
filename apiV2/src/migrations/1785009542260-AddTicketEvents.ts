import { MigrationInterface, QueryRunner } from 'typeorm';

// PLAN_TICKETING.md decision 7 — a ticket-scoped audit trail; each transition appends its own
// event row inline (no subscriber/interceptor). actor_user_id is nullable only for the T2 SLA
// sweep's SLA_BREACHED events, which have no human actor.
export class AddTicketEvents1785009542260 implements MigrationInterface {
  name = 'AddTicketEvents1785009542260';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."ticket_events_event_type_enum" AS ENUM('created', 'assigned', 'claimed', 'started', 'resolved', 'closed', 'cancelled', 'sla_breached')`,
    );
    await queryRunner.query(`
            CREATE TABLE "ticket_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "ticket_id" uuid NOT NULL,
                "event_type" "public"."ticket_events_event_type_enum" NOT NULL,
                "actor_user_id" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ticket_events_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "ticket_events"
            ADD CONSTRAINT "FK_ticket_events_ticket_id" FOREIGN KEY ("ticket_id")
            REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "ticket_events"
            ADD CONSTRAINT "FK_ticket_events_actor_user_id" FOREIGN KEY ("actor_user_id")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ticket_events" DROP CONSTRAINT "FK_ticket_events_actor_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket_events" DROP CONSTRAINT "FK_ticket_events_ticket_id"`,
    );
    await queryRunner.query(`DROP TABLE "ticket_events"`);
    await queryRunner.query(
      `DROP TYPE "public"."ticket_events_event_type_enum"`,
    );
  }
}
