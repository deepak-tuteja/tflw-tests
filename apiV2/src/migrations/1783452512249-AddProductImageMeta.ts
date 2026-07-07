import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductImageMeta1783452512249 implements MigrationInterface {
    name = 'AddProductImageMeta1783452512249'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" ADD "image_filename" character varying`);
        await queryRunner.query(`ALTER TABLE "products" ADD "image_mime_type" character varying`);
        await queryRunner.query(`ALTER TABLE "products" ADD "image_size_bytes" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "image_size_bytes"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "image_mime_type"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "image_filename"`);
    }

}
