import { MigrationInterface, QueryRunner } from 'typeorm';

// PLAN_TICKETING.md decision 5 — flat, chronological ticket comments with an isInternal flag.
export class AddTicketComments1785009442260 implements MigrationInterface {
  name = 'AddTicketComments1785009442260';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "ticket_comments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "ticket_id" uuid NOT NULL,
                "author_user_id" uuid NOT NULL,
                "text" text NOT NULL,
                "is_internal" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ticket_comments_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "ticket_comments"
            ADD CONSTRAINT "FK_ticket_comments_ticket_id" FOREIGN KEY ("ticket_id")
            REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "ticket_comments"
            ADD CONSTRAINT "FK_ticket_comments_author_user_id" FOREIGN KEY ("author_user_id")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ticket_comments" DROP CONSTRAINT "FK_ticket_comments_author_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket_comments" DROP CONSTRAINT "FK_ticket_comments_ticket_id"`,
    );
    await queryRunner.query(`DROP TABLE "ticket_comments"`);
  }
}
