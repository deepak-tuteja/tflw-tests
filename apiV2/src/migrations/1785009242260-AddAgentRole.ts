import { MigrationInterface, QueryRunner } from 'typeorm';

// PLAN_TICKETING.md decision 2 — a third role, scoped to the tickets domain only (no other
// endpoint in the app recognizes AGENT). Same empty-down precedent as AddAccountDeletion/
// AddRefundJobAndOrderStatus: Postgres has no DROP VALUE for enums.
export class AddAgentRole1785009242260 implements MigrationInterface {
  name = 'AddAgentRole1785009242260';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" ADD VALUE 'agent'`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres has no DROP VALUE for enums; recreating the type just to remove 'agent' is
    // unnecessary churn for a dev-only rollback path, so it's left in place.
  }
}
