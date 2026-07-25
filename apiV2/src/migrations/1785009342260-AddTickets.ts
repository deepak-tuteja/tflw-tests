import { MigrationInterface, QueryRunner } from 'typeorm';

// PLAN_TICKETING.md T1 — the core ticket resource. slaDeadline/slaBreached/breachedAt ride along
// in this same migration even though T2 is the milestone that populates them, to avoid a second
// migration touching this table.
export class AddTickets1785009342260 implements MigrationInterface {
  name = 'AddTickets1785009342260';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."tickets_status_enum" AS ENUM('open', 'in_progress', 'resolved', 'closed', 'cancelled')`,
    );
    await queryRunner.query(`
            CREATE TABLE "tickets" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "subject" text NOT NULL,
                "description" text NOT NULL,
                "status" "public"."tickets_status_enum" NOT NULL DEFAULT 'open',
                "submitted_by" uuid NOT NULL,
                "assigned_to" uuid,
                "sla_deadline" TIMESTAMP,
                "sla_breached" boolean NOT NULL DEFAULT false,
                "breached_at" TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_tickets_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "tickets"
            ADD CONSTRAINT "FK_tickets_submitted_by" FOREIGN KEY ("submitted_by")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "tickets"
            ADD CONSTRAINT "FK_tickets_assigned_to" FOREIGN KEY ("assigned_to")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP CONSTRAINT "FK_tickets_assigned_to"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP CONSTRAINT "FK_tickets_submitted_by"`,
    );
    await queryRunner.query(`DROP TABLE "tickets"`);
    await queryRunner.query(`DROP TYPE "public"."tickets_status_enum"`);
  }
}
