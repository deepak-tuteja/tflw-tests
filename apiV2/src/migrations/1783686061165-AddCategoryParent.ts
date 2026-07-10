import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCategoryParent1783686061165 implements MigrationInterface {
    name = 'AddCategoryParent1783686061165'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" ADD "parent_id" uuid`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_categories_parent_id" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_categories_parent_id"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "parent_id"`);
    }

}
