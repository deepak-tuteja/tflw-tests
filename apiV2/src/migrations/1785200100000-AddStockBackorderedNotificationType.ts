import { MigrationInterface, QueryRunner } from 'typeorm';

// PLAN_ENTERPRISE_REGRESSION.md E4 — same empty-down precedent as AddAgentRole/
// AddAccountDeletion/AddRefundJobAndOrderStatus: Postgres has no DROP VALUE for enums.
export class AddStockBackorderedNotificationType1785200100000 implements MigrationInterface {
  name = 'AddStockBackorderedNotificationType1785200100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE 'stock_backordered'`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres has no DROP VALUE for enums; recreating the type just to remove this value is
    // unnecessary churn for a dev-only rollback path, so it's left in place.
  }
}
