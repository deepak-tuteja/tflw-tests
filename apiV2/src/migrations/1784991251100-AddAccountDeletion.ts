import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountDeletion1784991251100 implements MigrationInterface {
  name = 'AddAccountDeletion1784991251100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "deactivated_at" TIMESTAMP`);

    // Jobs are no longer exclusively order-scoped: an ACCOUNT_DELETION job (added below) has no
    // order at all, so `order_id` drops its NOT NULL and a parallel nullable `user_id` is added —
    // exactly one of the two is populated depending on the job's type.
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "order_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "jobs" ADD "user_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD CONSTRAINT "FK_jobs_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TYPE "public"."jobs_type_enum" ADD VALUE 'account-deletion'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres has no DROP VALUE for enums; recreating the type just to remove
    // 'account-deletion' is unnecessary churn for a dev-only rollback path, so it's left in place.
    await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_jobs_user_id"`);
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "user_id"`);
    await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "order_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deactivated_at"`);
  }
}
