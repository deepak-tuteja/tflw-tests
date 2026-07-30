import { MigrationInterface, QueryRunner } from 'typeorm';

// PLAN_ENTERPRISE_REGRESSION.md E3 — the org/membership core: a customer company (Organization)
// plus a user's role within it (OrgMembership.orgRole: owner|admin|member), a second, independent
// axis from the existing system-level UserRole. One membership per (org, user) pair.
export class AddOrganizations1785100000000 implements MigrationInterface {
  name = 'AddOrganizations1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."organizations_plan_enum" AS ENUM('starter', 'business', 'enterprise')`,
    );
    await queryRunner.query(`
            CREATE TABLE "organizations" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "plan" "public"."organizations_plan_enum" NOT NULL DEFAULT 'starter',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_organizations_id" PRIMARY KEY ("id")
            )
        `);

    await queryRunner.query(
      `CREATE TYPE "public"."org_memberships_org_role_enum" AS ENUM('owner', 'admin', 'member')`,
    );
    await queryRunner.query(`
            CREATE TABLE "org_memberships" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "org_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "org_role" "public"."org_memberships_org_role_enum" NOT NULL DEFAULT 'member',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_org_memberships_org_user" UNIQUE ("org_id", "user_id"),
                CONSTRAINT "PK_org_memberships_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "org_memberships"
            ADD CONSTRAINT "FK_org_memberships_org_id" FOREIGN KEY ("org_id")
            REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "org_memberships"
            ADD CONSTRAINT "FK_org_memberships_user_id" FOREIGN KEY ("user_id")
            REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "org_memberships" DROP CONSTRAINT "FK_org_memberships_user_id"`);
    await queryRunner.query(`ALTER TABLE "org_memberships" DROP CONSTRAINT "FK_org_memberships_org_id"`);
    await queryRunner.query(`DROP TABLE "org_memberships"`);
    await queryRunner.query(`DROP TYPE "public"."org_memberships_org_role_enum"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
    await queryRunner.query(`DROP TYPE "public"."organizations_plan_enum"`);
  }
}
