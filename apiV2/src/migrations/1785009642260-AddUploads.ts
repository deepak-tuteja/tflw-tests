import { MigrationInterface, QueryRunner } from 'typeorm';

// PLAN_FILEFORMATS.md D1/D2 — a purpose-built fixture module (alongside contract-demo/retry-demo/
// flaky-widget) proving upload→download→parse round-trips for CSV/TXT/PDF content.
export class AddUploads1785009642260 implements MigrationInterface {
  name = 'AddUploads1785009642260';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."uploads_content_type_enum" AS ENUM('text/csv', 'text/plain', 'application/pdf')`,
    );
    await queryRunner.query(`
            CREATE TABLE "uploads" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "owner_id" uuid NOT NULL,
                "filename" text NOT NULL,
                "content_type" "public"."uploads_content_type_enum" NOT NULL,
                "data" bytea NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_uploads_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "uploads"
            ADD CONSTRAINT "FK_uploads_owner_id" FOREIGN KEY ("owner_id")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "uploads" DROP CONSTRAINT "FK_uploads_owner_id"`,
    );
    await queryRunner.query(`DROP TABLE "uploads"`);
    await queryRunner.query(`DROP TYPE "public"."uploads_content_type_enum"`);
  }
}
