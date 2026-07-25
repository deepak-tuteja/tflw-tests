import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAttributesAndVersion1784989964680 implements MigrationInterface {
  name = 'AddUserAttributesAndVersion1784989964680';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "attributes" jsonb NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "version" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "version"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "attributes"`);
  }
}
