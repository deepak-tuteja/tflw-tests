import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefundJobAndOrderStatus1784999684814 implements MigrationInterface {
  name = 'AddRefundJobAndOrderStatus1784999684814';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."jobs_type_enum" ADD VALUE 'refund'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."orders_status_enum" ADD VALUE 'refunded'`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres has no DROP VALUE for enums; recreating both types just to remove 'refund'/
    // 'refunded' is unnecessary churn for a dev-only rollback path, so they're left in place.
    // Unlike AddAccountDeletion's down() (which drops real columns/constraints alongside its
    // own no-op enum note), this down() has nothing else to undo, so queryRunner goes unused.
  }
}
