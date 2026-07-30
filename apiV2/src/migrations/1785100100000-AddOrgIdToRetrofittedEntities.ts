import { MigrationInterface, QueryRunner } from 'typeorm';

// PLAN_ENTERPRISE_REGRESSION.md E3 — the actual "retrofit" step: a nullable org_id on the 4
// entities decision 3 names (orders, tickets, reviews, coupons), each denormalized at write time
// (null preserves today's pre-org behavior exactly — an existing row/request with no org
// affiliation is untouched). Product/category catalog deliberately gets no column here (decision
// 3's "stays global/shared").
export class AddOrgIdToRetrofittedEntities1785100100000 implements MigrationInterface {
  name = 'AddOrgIdToRetrofittedEntities1785100100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['orders', 'tickets', 'reviews', 'coupons']) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "org_id" uuid`);
      await queryRunner.query(`
                ALTER TABLE "${table}"
                ADD CONSTRAINT "FK_${table}_org_id" FOREIGN KEY ("org_id")
                REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION
            `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['orders', 'tickets', 'reviews', 'coupons']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "FK_${table}_org_id"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "org_id"`);
    }
  }
}
