import { MigrationInterface, QueryRunner } from 'typeorm';

// PLAN_RETURNS.md R1 — a genuinely new resource (not a field on Order): one return request per
// order for its whole lifetime (UNIQUE on order_id, not just "one active at a time" — decision 6),
// a denormalized user_id (the order's owner, avoiding a join through order on every ownership
// check, same convenience Job already takes with its own orderId/userId columns), and a nullable
// decided_by/decision_reason/decided_at trio populated only once an admin acts.
export class AddReturnRequests1784998765574 implements MigrationInterface {
  name = 'AddReturnRequests1784998765574';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."return_requests_status_enum" AS ENUM('requested', 'approved', 'rejected')`,
    );
    await queryRunner.query(`
            CREATE TABLE "return_requests" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "order_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "reason" text NOT NULL,
                "status" "public"."return_requests_status_enum" NOT NULL DEFAULT 'requested',
                "decided_by" uuid,
                "decision_reason" text,
                "decided_at" TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_return_requests_order_id" UNIQUE ("order_id"),
                CONSTRAINT "PK_return_requests_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "return_requests"
            ADD CONSTRAINT "FK_return_requests_order_id" FOREIGN KEY ("order_id")
            REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "return_requests"
            ADD CONSTRAINT "FK_return_requests_user_id" FOREIGN KEY ("user_id")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "return_requests"
            ADD CONSTRAINT "FK_return_requests_decided_by" FOREIGN KEY ("decided_by")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "return_requests" DROP CONSTRAINT "FK_return_requests_decided_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_requests" DROP CONSTRAINT "FK_return_requests_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "return_requests" DROP CONSTRAINT "FK_return_requests_order_id"`,
    );
    await queryRunner.query(`DROP TABLE "return_requests"`);
    await queryRunner.query(`DROP TYPE "public"."return_requests_status_enum"`);
  }
}
