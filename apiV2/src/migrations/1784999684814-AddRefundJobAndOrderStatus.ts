import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefundJobAndOrderStatus1784999684814
  implements MigrationInterface
{
  name = 'AddRefundJobAndOrderStatus1784999684814';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."jobs_type_enum" ADD VALUE 'refund'`);
    await queryRunner.query(
      `ALTER TYPE "public"."orders_status_enum" ADD VALUE 'refunded'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres has no DROP VALUE for enums; recreating both types just to remove 'refund'/
    // 'refunded' is unnecessary churn for a dev-only rollback path, so they're left in place —
    // same precedent as AddAccountDeletion's down().
  }
}
